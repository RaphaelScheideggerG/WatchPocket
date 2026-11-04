import { useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import {
  ActionIcon,
  Box,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';

import StarryBackground from '../StarryBackground';

import type { PlaybackSignal, RoomState } from '../../hooks/useZzzRoom';
import {
  useYouTubePlayer,
  type PlayerEventHandlers,
} from '../../hooks/useYouTubePlayer';

import { usePlaybackSync } from '../../hooks/usePlaybackSync';

import {
  getYouTubeVideoId,
  isYouTubeUrl,
  searchYouTubeVideos,
  type SearchResult,
} from '../../utils/youtube';

import { validateVideoFile } from '../../utils/videoFile';
import { uploadVideoToR2 } from '../../services/videoStorage';

import VideoSearch from './VideoSearch';


type VideoProps = {
  roomState: RoomState | null;
  onSelectVideo: (videoId: string) => Promise<void>;
  playbackSignal: PlaybackSignal | null;
  userId: string | null;
  onSavePlayback: (
    currentSeconds: number,
    isPlaying: boolean,
    playbackRate?: number,
  ) => Promise<void>;
  onBroadcastPlayback: (
    signal: Omit<PlaybackSignal, 'userId'>,
  ) => Promise<void>;
};

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

const EMPTY_PLAYER_HANDLERS: PlayerEventHandlers = {
  onStateChange: () => undefined,
  onPlaybackRateChange: () => undefined,
  onError: () => undefined,
  onAutoplayBlocked: () => undefined,
};

export default function Video({
  roomState,
  onSelectVideo,
  playbackSignal,
  userId,
  onSavePlayback,
  onBroadcastPlayback,
}: VideoProps) {
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const videoId = roomState?.video_id ?? null;
  const videoIdRef = useRef<string | null>(videoId);
  const playerRef = useRef<any>(null);
  const playerMountRef = useRef<HTMLDivElement | null>(null);
  const playerHandlersRef = useRef<PlayerEventHandlers>(EMPTY_PLAYER_HANDLERS);
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  videoIdRef.current = videoId;

  const playerReady = useYouTubePlayer({
    mountRef: playerMountRef,
    playerRef,
    handlersRef: playerHandlersRef,
    setError,
  });

  const { restartVideo } = usePlaybackSync({
    roomState,
    videoId,
    playbackSignal,
    userId,
    playerReady,
    playerRef,
    handlersRef: playerHandlersRef,
    onSavePlayback,
    onBroadcastPlayback,
    setError,
  });

  const selectVideo = async (selectedVideoId: string) => {
    const previousVideoId = videoIdRef.current;
    setError('');

    try {
      await onSelectVideo(selectedVideoId);

      // Selecting the current item again is an explicit request to restart it.
      if (previousVideoId === selectedVideoId && playerRef.current) {
        restartVideo(selectedVideoId);
      }

      setShowSearch(false);
      setQuery('');
      setSearchResults([]);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : 'Não foi possível selecionar esse vídeo na sala.',
      );
    }
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const input = query.trim();
    if (!input || loading) return;

    setError('');
    setSearchResults([]);

    if (isYouTubeUrl(input)) {
      const id = getYouTubeVideoId(input);

      if (!id) {
        setError('Link de vídeo inválido.');
        return;
      }

      await selectVideo(id);
      return;
    }

    if (!YOUTUBE_API_KEY) {
      setError('Falta configurar VITE_YOUTUBE_API_KEY no .env.local.');
      return;
    }

    setLoading(true);

    try {
      const results = await searchYouTubeVideos(input, YOUTUBE_API_KEY);
      setSearchResults(results);

      if (results.length === 0) {
        setError('Nenhum vídeo encontrado.');
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : 'Falha ao buscar vídeos.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAttach = () => {
    // Dispara o clique no input oculto do sistema operacional
    fileInputRef.current?.click();
  };
  
  const handleFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const selectedFile = input.files?.[0];
  
    if (!selectedFile) return;
  
    // Permite selecionar novamente o mesmo arquivo.
    input.value = '';
  
    setError('');
  
    // 1. Valida o arquivo.
    const validation = validateVideoFile(selectedFile);
  
    if (!validation.valid) {
      setError(validation.error);
      return;
    }
  
    setLoading(true);
  
    try {
      // 2. Solicita ao serviço o upload do vídeo.
      const uploadedVideo = await uploadVideoToR2(selectedFile);
  
      console.log('Upload concluído:', uploadedVideo);
  
      // Futuramente:
      // 3. Registrar metadados no Supabase.
      // 4. Selecionar o vídeo na sala.
      // 5. Atualizar o player.
  
      setShowSearch(false);
      setQuery('');
  
    } catch (uploadError) {
      console.error(uploadError);
  
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Falha ao enviar o vídeo para a nuvem.',
      );
  
    } finally {
      setLoading(false);
    }
  };
  return (
    <Box
      pos="relative"
      w="100%"
      h="100%"
      mih={260}
      bg="#000"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: 12,
      }}
    >
      <Box
        ref={playerMountRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          visibility: videoId ? 'visible' : 'hidden',
          pointerEvents: videoId ? 'auto' : 'none',
        }}
      />

      {!videoId && (
        <Box
          pos="absolute"
          inset={0}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background:
              'radial-gradient(ellipse at center, #211321 0%, #100d16 55%, #0b0a0c 100%)',
          }}
        >
          <StarryBackground zIndex={0} />

          <Stack
            align="center"
            gap="xs"
            pos="relative"
            style={{
              zIndex: 1,
              userSelect: 'none',
              pointerEvents: 'none',
              textAlign: 'center',
            }}
          >
            <Text size="xl">🌙</Text>

            <Text c="gray.5" size="sm" fw={500}>
              Nosso próximo vídeo começa aqui.
            </Text>
          </Stack>
        </Box>
      )}

      <Box pos="absolute" top={14} left={14} style={{ zIndex: 5 }}>
        <ActionIcon
          type="button"
          aria-label="Buscar vídeo"
          variant="subtle"
          color="gray"
          radius="xl"
          size="lg"
          onClick={() => {
            setShowSearch((current) => !current);
            setError('');
          }}
          style={{
            color: 'white',
            background: showSearch
              ? 'rgba(230, 73, 128, 0.45)'
              : 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
          }}
        >
          <IconPlus
            size={18}
            style={{
              transform: showSearch ? 'rotate(45deg)' : 'none',
              transition: 'transform 180ms ease',
            }}
          />
        </ActionIcon>
      </Box>

      {error && !showSearch && (
        <Paper
          pos="absolute"
          top={62}
          left={14}
          p="sm"
          radius="md"
          style={{
            maxWidth: 420,
            background: 'rgba(16, 16, 20, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            zIndex: 7,
          }}
        >
          <Text size="xs" c="red.3">
            {error}
          </Text>
        </Paper>
      )}

      <VideoSearch
        mounted={showSearch}
        query={query}
        loading={loading}
        error={error}
        results={searchResults}
        onQueryChange={(value) => {
          setQuery(value);
          setError('');
        }}
        onSubmit={handleSearch}
        onSelectVideo={(id) => {
          void selectVideo(id);
        }}
        onAttach={handleAttach}
      />

      {/* Input de arquivo invisível e universal */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        // Dica mobile-first: aceita apenas formatos de vídeo populares
        accept="video/mp4,video/mkv,video/webm" 
      />
    </Box>
  );
}

