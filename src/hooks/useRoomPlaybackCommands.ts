import { useCallback, useEffect } from 'react';
import type { RoomState } from './useZzzRoom';
import type { PlaybackRuntime, VideoProviderType } from './playbackSyncTypes';
import type { YouTubePlayerRef } from './useYouTubePlayer';

type UseRoomPlaybackCommandsOptions = {
  roomState: RoomState | null;
  videoId: string | null;
  videoSource: VideoProviderType;
  playerReady: boolean;
  playerRef: YouTubePlayerRef;
  runtime: PlaybackRuntime;
  setError: (message: string) => void;
};

/** Handles selected-video changes and persisted room playback commands. */
export function useRoomPlaybackCommands({
  roomState,
  videoId,
  videoSource,
  playerReady,
  playerRef,
  runtime,
  setError,
}: UseRoomPlaybackCommandsOptions) {
  const {
    pendingRoomCommandRef,
    lastLoadedVideoIdRef,
    lastSampleRef,
    suppressEventsUntilRef,
  } = runtime;

  const restartVideo = useCallback(
    (targetVideoId: string) => {
      const player = playerRef.current;
      if (!player) return;

      pendingRoomCommandRef.current = {
        videoId: targetVideoId,
        currentSeconds: 0,
        isPlaying: true,
        provider: videoSource,
      };
      lastSampleRef.current = null;
      suppressEventsUntilRef.current = Date.now() + 1400;

      // Both player adapters implement this YouTube-compatible method.
      player.loadVideoById({
        videoId: targetVideoId,
        startSeconds: 0,
      });
    },
    [
      lastSampleRef,
      pendingRoomCommandRef,
      playerRef,
      suppressEventsUntilRef,
      videoSource,
    ],
  );

  // Load each selected item once. The provider is part of the identity because
  // a YouTube ID and an R2 object key belong to different playback systems.
  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player) return;

    if (!videoId) {
      lastLoadedVideoIdRef.current = null;
      pendingRoomCommandRef.current = null;
      return;
    }

    const loadKey = `${videoSource}:${videoId}`;
    if (lastLoadedVideoIdRef.current === loadKey) return;

    lastLoadedVideoIdRef.current = loadKey;
    lastSampleRef.current = null;

    const command = {
      videoId,
      currentSeconds: Math.max(0, Number(roomState?.current_seconds) || 0),
      isPlaying: roomState?.is_playing ?? true,
      provider: videoSource,
    };

    pendingRoomCommandRef.current = command;
    suppressEventsUntilRef.current = Date.now() + 1400;
    setError('');

    try {
      player.loadVideoById({ videoId, startSeconds: 0 });
    } catch (playerError) {
      lastLoadedVideoIdRef.current = null;
      pendingRoomCommandRef.current = null;
      setError(
        playerError instanceof Error
          ? playerError.message
          : 'Não foi possível carregar o novo vídeo.',
      );
    }
  }, [
    lastLoadedVideoIdRef,
    lastSampleRef,
    pendingRoomCommandRef,
    playerReady,
    playerRef,
    roomState,
    setError,
    suppressEventsUntilRef,
    videoId,
    videoSource,
  ]);



  return restartVideo;
}
