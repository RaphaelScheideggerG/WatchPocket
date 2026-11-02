import { useState, } from 'react';
import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextInput,
  Title,
  Text,
  SegmentedControl,
  Select,
} from '@mantine/core';

import StarryBackground from '../components/StarryBackground';

import { supabase } from '../lib/supabase';


type HomeProps = {
  onEnterRoom: (displayName: string, inviteCode: string | null, capacity?: number) => void;
};

export default function Home({ onEnterRoom }: HomeProps) {
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<string>('create');
  const [inviteCode, setInviteCode] = useState('');
  const [roomCapacity, setRoomCapacity] = useState<string>('2'); // Padrão 2 pessoas
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const name = displayName.trim();

    if (!name || isSubmitting) return;

    setError('');

    // A entrada em salas existentes continua como antes.
    // Vamos implementar essa parte depois.
    if (mode === 'join') {
      const code = inviteCode.trim();

      if (!code) return;

      onEnterRoom(name, code);
      return;
    }

    const capacity = Number(roomCapacity);

    if (!Number.isInteger(capacity) || capacity < 1) {
      setError('Selecione uma capacidade válida para a sala.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Verifica se já existe uma sessão autenticada.
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      // 2. Se não existir, cria uma sessão anônima.
      if (!session) {
        const { error: signInError } =
          await supabase.auth.signInAnonymously();

        if (signInError) {
          throw signInError;
        }
      }

      // 3. Pede ao PostgreSQL para criar a sala.
      const { data, error: createError } = await supabase.rpc(
        'zz_create_room',
        {
          p_display_name: name,
          p_room_capacity: capacity,
        },
      );

      if (createError) {
        throw createError;
      }

      // 4. Confere se o banco devolveu o convite.
      if (
        !data ||
        typeof data.invite_code !== 'string' ||
        typeof data.room_id !== 'string'
      ) {
        throw new Error(
          'A sala pode ter sido criada, mas o banco não retornou os dados esperados.',
        );
      }

      // 5. Entrega o convite ao fluxo de navegação do aplicativo.
      onEnterRoom(name, data.invite_code, capacity);
    } catch (err: unknown) {
      console.error('Erro ao criar sala:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível criar a sala.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box
      mih="100vh"
      c="white"
      pos="relative"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        overflow: 'hidden',
        background:
          'radial-gradient(ellipse at 50% 45%, #30203f 0%, #18121f 45%, #0b0a0c 100%)',
      }}
    >
      <StarryBackground />

      {/* 2. CONTEÚDO PRINCIPAL */}
      <Container size={420} w="100%" style={{ position: 'relative', zIndex: 1 }}>
        <Stack align="center" gap="xs" mb="xl">
          <Title order={1} ta="center" fw={800}>
            WatchPocket <Text span c="#e64980">♥</Text>
          </Title>
        </Stack>

        <Paper
          p="xl"
          radius="lg"
          bg="rgba(21, 19, 24, 0.82)"
          withBorder
          style={{
            borderColor: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          }}
        >
          <Stack gap="md">
            <TextInput
              label="Como podemos te chamar?"
              placeholder="Seu nome ou apelido"
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              maxLength={40}
              required
              styles={{
                input: {
                  backgroundColor: 'rgba(11, 10, 12, 0.8)',
                  borderColor: '#302a33',
                  color: 'white',
                },
                label: { marginBottom: 6 },
              }}
            />

            <SegmentedControl
              fullWidth
              value={mode}
              onChange={setMode}
              data={[
                { label: 'Criar sala', value: 'create' },
                { label: 'Entrar em sala', value: 'join' },
              ]}
              color="pink"
            />

            {mode === 'create' && (
              <Select
                label="Capacidade da sala"
                placeholder="Selecione o número de pessoas"
                value={roomCapacity}
                onChange={(value) => value && setRoomCapacity(value)}
                data={['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']}
                required
                styles={{
                  input: {
                    backgroundColor: 'rgba(11, 10, 12, 0.8)',
                    borderColor: '#302a33',
                    color: 'white',
                  },
                  dropdown: {
                    backgroundColor: '#151318',
                    borderColor: '#302a33',
                    color: 'white',
                  },
                  option: {
                    color: 'white',
                    '&[data-hovered]': {
                      backgroundColor: 'rgba(230, 73, 128, 0.15)',
                    },
                    '&[data-selected]': {
                      backgroundColor: '#e64980',
                      color: 'white',
                    },
                  },
                }}
              />
            )}

            {mode === 'join' && (
              <TextInput
                label="Código do convite"
                placeholder="Cole o código da sala"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.currentTarget.value)}
                required
                styles={{
                  input: {
                    backgroundColor: 'rgba(11, 10, 12, 0.8)',
                    borderColor: '#302a33',
                    color: 'white',
                  },
                }}
              />
            )}
            {error && (
              <Text c="red" size="sm" role="alert">
                {error}
              </Text>
            )}
            <Button
              fullWidth
              color="pink"
              size="md"
              radius="md"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={
                isSubmitting ||
                !displayName.trim() ||
                (mode === 'join' && !inviteCode.trim())
              }
              style={{
                boxShadow: '0 4px 16px rgba(230, 73, 128, 0.25)',
              }}
            >
              {mode === 'create' ? 'Criar minha sala' : 'Entrar na sala'}
            </Button>
          </Stack>
        </Paper>

        <Text ta="center" c="dimmed" size="xs" mt="lg">
          Um cantinho para assistir juntos
        </Text>
      </Container>
    </Box>
  );
}