-- ZZzzzzz: sala privada, chat persistente e estado compartilhado do player.
-- Execute no Supabase SQL Editor. O código de convite é secreto e pode ser compartilhado por link.

create table if not exists public.zz_rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  room_capacity integer not null default 2,
  created_at timestamptz not null default now()
);

create table if not exists public.zz_room_members (
  room_id uuid not null references public.zz_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.zz_room_state (
  room_id uuid primary key references public.zz_rooms(id) on delete cascade,
  video_id text,
  is_playing boolean not null default false,
  current_seconds double precision not null default 0 check (current_seconds >= 0),
  playback_rate double precision not null default 1.0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint zz_room_state_video_id_format check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$')
);

create table if not exists public.zz_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.zz_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null check (char_length(sender_name) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists zz_messages_room_created_idx
  on public.zz_messages (room_id, created_at desc);

-- Sem acesso direto às salas/convites: a entrada passa por zz_join_room.
alter table public.zz_rooms enable row level security;
alter table public.zz_room_members enable row level security;
alter table public.zz_room_state enable row level security;
alter table public.zz_messages enable row level security;

revoke all on table public.zz_rooms from anon, authenticated;
revoke all on table public.zz_room_members from anon, authenticated;
revoke all on table public.zz_room_state from anon, authenticated;
revoke all on table public.zz_messages from anon, authenticated;

grant select on table public.zz_room_members to authenticated;
grant select, update on table public.zz_room_state to authenticated;
grant select, insert on table public.zz_messages to authenticated;

create or replace function public.zz_is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.zz_room_members as member
    where member.room_id = p_room_id
      and member.user_id = (select auth.uid())
  );
$$;

revoke all on function public.zz_is_room_member(uuid) from public, anon;
grant execute on function public.zz_is_room_member(uuid) to authenticated;

create policy "ZZ members can read their own membership"
on public.zz_room_members
for select to authenticated
using (user_id = (select auth.uid()));

create policy "ZZ members can read room state"
on public.zz_room_state
for select to authenticated
using ((select public.zz_is_room_member(room_id)));

create policy "ZZ members can update room state"
on public.zz_room_state
for update to authenticated
using ((select public.zz_is_room_member(room_id)))
with check (
  (select public.zz_is_room_member(room_id))
  and updated_by = (select auth.uid())
);

create policy "ZZ members can read room chat"
on public.zz_messages
for select to authenticated
using ((select public.zz_is_room_member(room_id)));

create policy "ZZ members can send room chat"
on public.zz_messages
for insert to authenticated
with check (
  (select public.zz_is_room_member(room_id))
  and sender_id = (select auth.uid())
  and char_length(btrim(body)) between 1 and 1000
);

-- Criar estado vazio automaticamente ao criar uma sala.
create or replace function public.zz_create_room_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.zz_room_state (room_id) values (new.id)
  on conflict (room_id) do nothing;
  return new;
end;
$$;

drop trigger if exists zz_rooms_create_state on public.zz_rooms;
create trigger zz_rooms_create_state
after insert on public.zz_rooms
for each row execute function public.zz_create_room_state();

-- Garantir timestamp do último comando persistido (troca de vídeo/play/pause).
create or replace function public.zz_touch_room_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists zz_room_state_touch_updated_at on public.zz_room_state;
create trigger zz_room_state_touch_updated_at
before update on public.zz_room_state
for each row execute function public.zz_touch_room_state();

-- Sign-in anônimo no frontend; só quem tem o código de convite pode virar membro.
create or replace function public.zz_join_room(p_invite_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessão não autenticada. Tente recarregar a página.';
  end if;

  v_name := left(btrim(coalesce(p_display_name, '')), 40);
  if v_name = '' then
    raise exception 'Digite um nome para entrar na sala.';
  end if;

  if btrim(coalesce(p_invite_code, '')) = '' then
    raise exception 'Informe o código de convite da sala.';
  end if;

  select room.id into v_room_id
  from public.zz_rooms as room
  where room.invite_code = btrim(p_invite_code)
  limit 1;

  if v_room_id is null then
    raise exception 'Código de sala inválido. Confira o link de convite.';
  end if;

  insert into public.zz_room_members (room_id, user_id, display_name)
  values (v_room_id, (select auth.uid()), v_name)
  on conflict (room_id, user_id)
  do update set display_name = excluded.display_name;

  return v_room_id;
end;
$$;

revoke all on function public.zz_join_room(text, text) from public, anon;
grant execute on function public.zz_join_room(text, text) to authenticated;

-- Realtime privado: só membros da sala podem ouvir/enviar Broadcast ou Presence no tópico room:<uuid>.
drop policy if exists "ZZ room members can receive private realtime" on realtime.messages;
create policy "ZZ room members can receive private realtime"
on realtime.messages
for select to authenticated
using (
  extension in ('broadcast', 'presence')
  and exists (
    select 1 from public.zz_room_members as member
    where member.user_id = (select auth.uid())
      and ('room:' || member.room_id::text) = (select realtime.topic())
  )
);

drop policy if exists "ZZ room members can send private realtime" on realtime.messages;
create policy "ZZ room members can send private realtime"
on realtime.messages
for insert to authenticated
with check (
  extension in ('broadcast', 'presence')
  and exists (
    select 1 from public.zz_room_members as member
    where member.user_id = (select auth.uid())
      and ('room:' || member.room_id::text) = (select realtime.topic())
  )
);

-- Inscrever as duas tabelas na publicação de Realtime, sem falhar se já estiverem adicionadas.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'zz_room_state'
  ) then
    execute 'alter publication supabase_realtime add table public.zz_room_state';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'zz_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.zz_messages';
  end if;
end;
$$;

-- Crie uma sala UMA VEZ depois de executar esta migração:
-- insert into public.zz_rooms default values returning invite_code;
-- Copie o invite_code retornado. Ele é o segredo do link compartilhado.

-- =========================================================
-- 1. Estrutura básica das salas
-- =========================================================

-- Identifica o proprietário da sala.
-- Salas já existentes podem continuar com created_by = NULL.
alter table public.zz_rooms
add column if not exists created_by uuid
references auth.users(id) on delete cascade;


-- =========================================================
-- 2. Participantes
-- =========================================================

create table if not exists public.zz_room_members (
    room_id uuid not null
        references public.zz_rooms(id) on delete cascade,

    user_id uuid not null
        references auth.users(id) on delete cascade,

    display_name text not null
        check (char_length(btrim(display_name)) between 1 and 40),

    joined_at timestamptz not null default now(),

    primary key (room_id, user_id)
);

alter table public.zz_room_members enable row level security;


-- =========================================================
-- 3. Estado compartilhado do player
-- =========================================================

create table if not exists public.zz_room_state (
    room_id uuid primary key
        references public.zz_rooms(id) on delete cascade,

    video_id text,

    is_playing boolean not null default false,

    current_seconds double precision not null default 0
        check (current_seconds >= 0),

    playback_rate double precision not null default 1.0
        check (playback_rate > 0),

    updated_by uuid
        references auth.users(id) on delete set null,

    updated_at timestamptz not null default now(),

    constraint zz_room_state_video_id_format
        check (
            video_id is null
            or video_id ~ '^[A-Za-z0-9_-]{11}$'
        )
);

alter table public.zz_room_state enable row level security;


-- =========================================================
-- 4. Criar o estado vazio automaticamente
-- =========================================================

create or replace function public.zz_create_room_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.zz_room_state (room_id)
    values (new.id)
    on conflict (room_id) do nothing;

    return new;
end;
$$;

drop trigger if exists zz_rooms_create_state
on public.zz_rooms;

create trigger zz_rooms_create_state
after insert on public.zz_rooms
for each row
execute function public.zz_create_room_state();

-- Garante o estado das salas que porventura já existam.
insert into public.zz_room_state (room_id)
select id
from public.zz_rooms
on conflict (room_id) do nothing;


-- =========================================================
-- 5. Função que efetivamente cria a sala
-- =========================================================

create or replace function public.zz_create_room(
    p_display_name text,
    p_room_capacity integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_display_name text;
    v_room_id uuid;
    v_invite_code text;
begin
    -- Identifica o usuário da sessão autenticada atual.
    v_user_id := (select auth.uid());

    if v_user_id is null then
        raise exception
            'Você precisa estar autenticado para criar uma sala.';
    end if;

    -- Normaliza e valida o nome.
    v_display_name :=
        left(btrim(coalesce(p_display_name, '')), 40);

    if v_display_name = '' then
        raise exception 'Digite um nome para criar a sala.';
    end if;

    -- Valida a capacidade informada.
    if p_room_capacity is null or p_room_capacity < 1 then
        raise exception
            'A capacidade da sala precisa ser de pelo menos uma pessoa.';
    end if;

    -- Cria a sala e obtém o ID e o código gerados pelo banco.
    insert into public.zz_rooms (
        room_capacity,
        created_by
    )
    values (
        p_room_capacity,
        v_user_id
    )
    returning id, invite_code
    into v_room_id, v_invite_code;

    -- Associa o criador à sala.
    insert into public.zz_room_members (
        room_id,
        user_id,
        display_name
    )
    values (
        v_room_id,
        v_user_id,
        v_display_name
    );

    -- Devolve os dados que o frontend precisa.
    return jsonb_build_object(
        'room_id', v_room_id,
        'invite_code', v_invite_code
    );
end;
$$;


-- =========================================================
-- 6. Permissões para chamar a função
-- =========================================================

revoke all on function public.zz_create_room(text, integer)
from public, anon;

grant execute on function public.zz_create_room(text, integer)
to authenticated;

-- Allows zz_room_state to store either a YouTube ID or an R2 object key.
-- Existing rows remain YouTube videos because the new column defaults to 'youtube'.
-- This migration also reconciles the earlier optional uploaded_video_id design,
-- if that version was created but not yet used by the application.

begin;

alter table public.zz_room_state
  add column if not exists video_source text not null default 'youtube';

-- Remove either the original YouTube-only check or checks from the earlier
-- uploaded_video_id proposal so they can be replaced by one consistent model.
alter table public.zz_room_state
  drop constraint if exists zz_room_state_video_id_format;

alter table public.zz_room_state
  drop constraint if exists zz_room_state_video_source_check;

alter table public.zz_room_state
  drop constraint if exists zz_room_state_video_format_check;

-- If the earlier metadata-table approach was applied, copy its storage_path
-- into video_id. The new app stores the R2 object key directly in video_id.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'zz_room_state'
      and column_name = 'uploaded_video_id'
  ) and to_regclass('public.zz_uploaded_videos') is not null then
    execute '
      update public.zz_room_state as room_state
      set video_source = ''upload'',
          video_id = uploaded_video.storage_path,
          uploaded_video_id = null
      from public.zz_uploaded_videos as uploaded_video
      where room_state.uploaded_video_id = uploaded_video.id
    ';
  end if;
end;
$$;

alter table public.zz_room_state
  add constraint zz_room_state_video_source_check
  check (video_source in ('youtube', 'upload'));

alter table public.zz_room_state
  add constraint zz_room_state_video_id_format
  check (
    video_id is null
    or (
      video_source = 'youtube'
      and video_id ~ '^[A-Za-z0-9_-]{11}$'
    )
    or (
      video_source = 'upload'
      and video_id ~ '^videos/[0-9a-fA-F-]{36}\.mp4$'
    )
  );

commit;