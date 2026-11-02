import { useCallback, useEffect } from 'react';
import type { RoomState } from './useZzzRoom';
import type { PlaybackRuntime } from './playbackSyncTypes';
import type { YouTubePlayerRef } from './useYouTubePlayer';

type UseRoomPlaybackCommandsOptions = {
  roomState: RoomState | null;
  videoId: string | null;
  playerReady: boolean;
  playerRef: YouTubePlayerRef;
  runtime: PlaybackRuntime;
  applyRoomCommand: (player: any, command: {
    videoId: string;
    currentSeconds: number;
    isPlaying: boolean;
  }) => void;
  setError: (message: string) => void;
};

/** Handles video changes and play/pause commands persisted in the room. */
export function useRoomPlaybackCommands({
  roomState,
  videoId,
  playerReady,
  playerRef,
  runtime,
  applyRoomCommand,
  setError,
}: UseRoomPlaybackCommandsOptions) {
  const {
    pendingRoomCommandRef,
    lastLoadedVideoIdRef,
    lastAppliedRoomCommandKeyRef,
    hasAppliedRoomCommandRef,
    lastSampleRef,
    suppressEventsUntilRef,
  } = runtime;

  const restartVideo = useCallback((targetVideoId: string) => {
    const player = playerRef.current;
    if (!player) return;

    pendingRoomCommandRef.current = {
      videoId: targetVideoId,
      currentSeconds: 0,
      isPlaying: true,
    };
    lastSampleRef.current = null;
    suppressEventsUntilRef.current = Date.now() + 1400;

    player.loadVideoById({
      videoId: targetVideoId,
      startSeconds: 0,
    });
  }, [lastSampleRef, pendingRoomCommandRef, playerRef, suppressEventsUntilRef]);

  // Load each newly selected video once, using the latest saved room position.
  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player) return;

    if (!videoId) {
      lastLoadedVideoIdRef.current = null;
      pendingRoomCommandRef.current = null;
      return;
    }

    if (lastLoadedVideoIdRef.current === videoId) return;

    lastLoadedVideoIdRef.current = videoId;
    lastSampleRef.current = null;

    const command = {
      videoId,
      currentSeconds: Math.max(
        0,
        Number(roomState?.current_seconds) || 0,
      ),
      isPlaying: roomState?.is_playing ?? true,
    };

    pendingRoomCommandRef.current = command;
    suppressEventsUntilRef.current = Date.now() + 700;
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
  ]);

  // Apply the saved play/pause state once on join; live sync uses playback signals.
  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player || !roomState?.video_id) return;

    const commandKey = `${roomState.video_id}:${roomState.is_playing}`;
    if (lastAppliedRoomCommandKeyRef.current === commandKey) return;

    const isInitialCommand = !hasAppliedRoomCommandRef.current;
    lastAppliedRoomCommandKeyRef.current = commandKey;
    hasAppliedRoomCommandRef.current = true;

    if (!isInitialCommand) return;

    const command = {
      videoId: roomState.video_id,
      currentSeconds: Math.max(
        0,
        Number(roomState.current_seconds) || 0,
      ),
      isPlaying: roomState.is_playing,
    };

    const actualVideoId = player.getVideoData?.()?.video_id;

    if (actualVideoId !== command.videoId) {
      pendingRoomCommandRef.current = command;
      return;
    }

    applyRoomCommand(player, command);
  }, [
    applyRoomCommand,
    hasAppliedRoomCommandRef,
    lastAppliedRoomCommandKeyRef,
    pendingRoomCommandRef,
    playerReady,
    playerRef,
    roomState,
  ]);

  return restartVideo;
}
