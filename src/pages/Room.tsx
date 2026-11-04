import { useEffect, useState } from 'react';

import {
  Box,
  Group,
  ActionIcon,
  Tooltip,
  Text,
} from '@mantine/core';

import {
  IconShare,
  IconCheck,
} from '@tabler/icons-react';

import Player from '../components/Player';
import { useZzzRoom } from '../hooks/useZzzRoom';


type RoomProps = {
  displayName: string;
  inviteCode: string;
  onLeave: () => void;
};

export default function Room({
  displayName,
  inviteCode,
}: RoomProps) {
  const [copied, setCopied] = useState(false);

  // Conecta o usuário à sala e disponibiliza os dados compartilhados.
  const {
    status,
    roomState,
    messages,
    userId,
    error,
    selectVideo,
    sendMessage,
    playbackSignal,
    savePlayback,
    broadcastPlayback,
  } = useZzzRoom({
    inviteCode,
    displayName,
    enabled: true,
  });

  const [visibleError, setVisibleError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) {
      setVisibleError(null);
      return;
    }
  
    setVisibleError(error);
  
    const timeoutId = window.setTimeout(() => {
      setVisibleError(null);
    }, 5000);
  
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [error]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);

      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Não foi possível copiar o código:', error);
    }
  };

  return (
    <Box
      pos="relative"
      w="100vw"
      h="100vh"
      bg="#0b0a0c"
      style={{ overflow: 'hidden' }}
    >
      {/* 1. Player e chat */}

      <Box
        w="100%"
        h="100%"
        pos="relative"
        style={{ zIndex: 1 }}
      >
        <Player
          roomState={roomState}
          onSelectVideo={selectVideo}
          messages={messages}
          userId={userId}
          onSendMessage={sendMessage}
          playbackSignal={playbackSignal}
          onSavePlayback={savePlayback}
          onBroadcastPlayback={broadcastPlayback}
        />
      </Box>

      {/* 2. Indicador de conexão e erros */}

      {(status === 'connecting' || visibleError) && (
        <Box
          pos="absolute"
          top={16}
          left={16}
          maw="70%"
          p="xs"
          style={{
            zIndex: 10,
            background: 'rgba(10, 10, 14, 0.8)',
            backdropFilter: 'blur(8px)',
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        >
          <Text
            size="xs"
            c={visibleError ? 'red.3' : 'gray.3'}
          >
            {visibleError || 'Conectando à sala...'}
          </Text>
        </Box>
      )}
      {/* 3. Botão de compartilhamento */}

      <Box
        pos="absolute"
        top={16}
        right={16}
        style={{
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <Group
          justify="flex-end"
          align="center"
          style={{ width: '100%' }}
        >
          <Group
            gap="xs"
            style={{
              pointerEvents: 'auto',
              position: 'relative',
            }}
          >
            <Tooltip
              label={copied ? 'Código copiado!' : 'Copiar código da sala'}
              position="bottom"
            >
              <ActionIcon
                variant="subtle"
                color="gray"
                radius="xl"
                size="lg"
                style={{
                  background: 'rgba(235, 235, 228, 0.05)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: copied
                    ? 'rgba(214, 51, 108, 0.85)'
                    : '#b2b2b2',
                  transition: 'all 200ms ease',
                }}
                onClick={handleShare}
              >
                {copied ? (
                  <IconCheck size={18} />
                ) : (
                  <IconShare size={18} />
                )}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Box>
    </Box>
  );
}