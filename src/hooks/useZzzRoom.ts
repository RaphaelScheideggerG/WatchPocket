import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { VideoProviderType } from './playbackSyncTypes';

export type RoomState = {
  room_id: string;
  video_id: string | null;
  video_source: VideoProviderType;
  is_playing: boolean;
  current_seconds: number;
  playback_rate: number;
  updated_by: string | null;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

export type PlaybackSignal = {
  userId: string;
  videoId: string;
  videoSource: VideoProviderType;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  sentAt: number;
  kind?: 'intent' | 'heartbeat';
};

export type OnlinePerson = {
  user_id: string;
  display_name: string;
  online_at?: string;
};

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

type UseZzzRoomOptions = {
  inviteCode: string;
  displayName: string;
  enabled: boolean;
};

function mergeMessages(...groups: ChatMessage[][]): ChatMessage[] {
  const unique = new Map<string, ChatMessage>();
  for (const group of groups) {
    for (const message of group) unique.set(message.id, message);
  }
  return [...unique.values()]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .slice(-100);
}

function newestState(
  current: RoomState | null,
  incoming: RoomState | null,
): RoomState | null {
  if (!current) return incoming;
  if (!incoming) return current;
  return Date.parse(incoming.updated_at) >= Date.parse(current.updated_at)
    ? incoming
    : current;
}

export function useZzzRoom({
  inviteCode,
  displayName,
  enabled,
}: UseZzzRoomOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [playbackSignal, setPlaybackSignal] = useState<PlaybackSignal | null>(null);
  const [onlinePeople, setOnlinePeople] = useState<OnlinePerson[]>([]);
  const [error, setError] = useState('');
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled || !inviteCode.trim() || !displayName.trim()) {
      setStatus('idle');
      return;
    }

    let alive = true;
    let channel: RealtimeChannel | null = null;

    const connect = async () => {
      setStatus('connecting');
      setError('');
      setRoomState(null);
      setMessages([]);
      setPlaybackSignal(null);
      setOnlinePeople([]);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      let authUser: User | null = sessionData.session?.user ?? null;
      if (!authUser) {
        const { data, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) {
          throw new Error(
            `Não consegui criar sua sessão anônima. Ative Anonymous Sign-Ins em Authentication → Sign In / Providers. (${signInError.message})`,
          );
        }
        authUser = data.user;
      }

      if (!authUser) throw new Error('O Supabase não retornou um usuário autenticado.');
      const user = authUser;
      if (!alive) return;
      setUserId(user.id);

      const { data: joinedRoomId, error: joinError } = await supabase.rpc('zz_join_room', {
        p_invite_code: inviteCode.trim(),
        p_display_name: displayName.trim().slice(0, 40),
      });
      if (joinError) throw new Error(joinError.message);
      if (typeof joinedRoomId !== 'string' || !joinedRoomId) {
        throw new Error('O Supabase não retornou o ID da sala. Confira a migração SQL.');
      }
      if (!alive) return;
      setRoomId(joinedRoomId);

      channel = supabase.channel(`room:${joinedRoomId}`, {
        config: { private: true, presence: { key: user.id } },
      });
      channelRef.current = channel;

      channel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'zz_room_state',
            filter: `room_id=eq.${joinedRoomId}`,
          },
          (payload) => {
            if (alive) {
              setRoomState((current) =>
                newestState(current, payload.new as RoomState),
              );
            }
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'zz_messages',
            filter: `room_id=eq.${joinedRoomId}`,
          },
          (payload) => {
            if (alive) {
              setMessages((current) =>
                mergeMessages(current, [payload.new as ChatMessage]),
              );
            }
          },
        )
        .on('broadcast', { event: 'playback' }, ({ payload }) => {
          if (!alive || !payload || typeof payload !== 'object') return;
          const signal = payload as PlaybackSignal;
          if (
            typeof signal.userId === 'string' &&
            typeof signal.videoId === 'string' &&
            (signal.videoSource === 'youtube' || signal.videoSource === 'upload')
          ) {
            setPlaybackSignal(signal);
          }
        })
        .on('presence', { event: 'sync' }, () => {
          if (!alive || !channel) return;
          const state = channel.presenceState() as Record<string, OnlinePerson[]>;
          const people = Object.values(state).flat();
          const unique = new Map<string, OnlinePerson>();
          for (const person of people) {
            if (person.user_id) unique.set(person.user_id, person);
          }
          setOnlinePeople([...unique.values()]);
        })
        .subscribe(async (channelStatus, subscribeError) => {
          if (!alive) return;

          if (channelStatus === 'SUBSCRIBED') {
            setStatus('connected');
            await channel?.track({
              user_id: user.id,
              display_name: displayName.trim().slice(0, 40),
              online_at: new Date().toISOString(),
            });

            try {
              const [stateResult, messagesResult] = await Promise.all([
                supabase
                  .from('zz_room_state')
                  .select('*')
                  .eq('room_id', joinedRoomId)
                  .single(),
                supabase
                  .from('zz_messages')
                  .select('*')
                  .eq('room_id', joinedRoomId)
                  .order('created_at', { ascending: false })
                  .limit(100),
              ]);
              if (!alive) return;
              if (stateResult.error) throw stateResult.error;
              if (messagesResult.error) throw messagesResult.error;

              setRoomState((current) =>
                newestState(current, stateResult.data as RoomState),
              );
              setMessages((current) =>
                mergeMessages(
                  [...(messagesResult.data ?? [])].reverse() as ChatMessage[],
                  current,
                ),
              );
            } catch (loadError) {
              setError(
                loadError instanceof Error
                  ? loadError.message
                  : 'Falha ao carregar a sala.',
              );
            }
          } else if (
            channelStatus === 'CHANNEL_ERROR' ||
            channelStatus === 'TIMED_OUT'
          ) {
            setStatus('error');
            setError(
              subscribeError?.message ??
                'A conexão Realtime falhou. Confira as políticas e tente recarregar.',
            );
          } else if (channelStatus === 'CLOSED') {
            setStatus('idle');
          }
        });
    };

    connect().catch((connectError: unknown) => {
      if (!alive) return;
      setStatus('error');
      setError(
        connectError instanceof Error
          ? connectError.message
          : 'Não foi possível entrar na sala.',
      );
    });

    return () => {
      alive = false;
      if (channel) void supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [enabled, inviteCode, displayName]);

  useEffect(() => {
    if (!enabled || status !== 'connected' || !roomId || !userId) return;

    let active = true;
    let heartbeatInFlight = false;

    const heartbeat = async () => {
      if (!active || heartbeatInFlight) return;
      heartbeatInFlight = true;

      try {
        const { error: heartbeatError } = await supabase.rpc(
          'zz_heartbeat_room',
          { p_room_id: roomId },
        );
        if (heartbeatError && active) {
          console.error(
            '[ZZzzzzz] Falha ao renovar a atividade da sala:',
            heartbeatError.message,
          );
        }
      } catch (heartbeatError) {
        if (active) {
          console.error('[ZZzzzzz] Erro inesperado no heartbeat:', heartbeatError);
        }
      } finally {
        heartbeatInFlight = false;
      }
    };

    void heartbeat();
    const intervalId = window.setInterval(() => void heartbeat(), 30_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [enabled, status, roomId, userId]);

  const selectVideo = useCallback(
    async (videoId: string, videoSource: VideoProviderType = 'youtube') => {
      if (!roomId || !userId) return;

      const { data, error: updateError } = await supabase
        .from('zz_room_state')
        .update({
          video_id: videoId,
          video_source: videoSource,
          is_playing: true,
          current_seconds: 0,
          updated_by: userId,
        })
        .eq('room_id', roomId)
        .select('*')
        .single();

      if (updateError) {
        setError(updateError.message);
        throw updateError;
      }

      setRoomState(data as RoomState);
    },
    [roomId, userId],
  );

  const savePlayback = useCallback(
    async (
      currentTime: number,
      isPlaying: boolean,
      playbackRate?: number,
    ) => {
      if (!roomId || !userId) return;

      const safeTime = Number.isFinite(currentTime)
        ? Math.max(0, currentTime)
        : 0;
      const updateData = {
        current_seconds: safeTime,
        is_playing: isPlaying,
        updated_by: userId,
        ...(playbackRate !== undefined && Number.isFinite(playbackRate)
          ? { playback_rate: playbackRate }
          : {}),
      };

      const { data, error: updateError } = await supabase
        .from('zz_room_state')
        .update(updateData)
        .eq('room_id', roomId)
        .select('*')
        .single();

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setRoomState((current) => newestState(current, data as RoomState));
    },
    [roomId, userId],
  );

  const broadcastPlayback = useCallback(
    async (signal: Omit<PlaybackSignal, 'userId'>) => {
      if (!channelRef.current || !userId) return;
      const sendStatus = await channelRef.current.send({
        type: 'broadcast',
        event: 'playback',
        payload: { ...signal, userId },
      });
      if (sendStatus !== 'ok') {
        setError('Não consegui sincronizar o player por Realtime.');
      }
    },
    [userId],
  );

  const clearError = useCallback(() => setError(''), []);

  const sendMessage = useCallback(
    async (body: string) => {
      const cleanBody = body.trim().slice(0, 1000);
      if (!roomId || !userId || !cleanBody) return;

      const { data, error: insertError } = await supabase
        .from('zz_messages')
        .insert({ room_id: roomId, body: cleanBody })
        .select('*')
        .single();

      if (insertError) {
        setError(insertError.message);
        throw insertError;
      }

      setMessages((current) => mergeMessages(current, [data as ChatMessage]));
    },
    [roomId, userId, displayName],
  );

  return {
    status,
    roomId,
    userId,
    roomState,
    messages,
    playbackSignal,
    onlinePeople,
    error,
    clearError,
    selectVideo,
    savePlayback,
    broadcastPlayback,
    sendMessage,
  };
}
