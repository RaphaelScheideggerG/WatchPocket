import { useCallback, useRef } from 'react';
import type {
  PendingRoomCommand,
  PlaybackRuntime,
  PlaybackSample,
  SavePlayback,
  BroadcastPlayback,
  VideoProviderType,
} from './playbackSyncTypes';

type UsePlaybackRuntimeOptions = {
  videoId: string | null;
  videoSource: VideoProviderType;
  onSavePlayback: SavePlayback;
  onBroadcastPlayback: BroadcastPlayback;
};

/** Stores shared refs and stable helpers used by the playback sub-hooks. */
export function usePlaybackRuntime({
  videoId,
  videoSource,
  onSavePlayback,
  onBroadcastPlayback,
}: UsePlaybackRuntimeOptions) {
  const videoIdRef = useRef<string | null>(videoId);
  const providerRef = useRef<VideoProviderType>(videoSource);
  const callbacksRef = useRef({ onSavePlayback, onBroadcastPlayback });
  const pendingRoomCommandRef = useRef<PendingRoomCommand | null>(null);
  const lastLoadedVideoIdRef = useRef<string | null>(null);
  const lastAppliedSignalKeyRef = useRef<string | null>(null);
  const lastAppliedIntentAtRef = useRef(0);
  const lastLocalIntentAtRef = useRef(0);
  const expectedPlayerStateRef = useRef<number | null>(null);
  const suppressEventsUntilRef = useRef(0);
  const lastPersistedAtRef = useRef(0);
  const lastSampleRef = useRef<PlaybackSample | null>(null);

  videoIdRef.current = videoId;
  providerRef.current = videoSource;
  callbacksRef.current = { onSavePlayback, onBroadcastPlayback };

  const publishPlayback = useCallback(
    (
      targetVideoId: string,
      currentSeconds: number,
      isPlaying: boolean,
      playbackRate = 1,
    ) => {
      const safeSeconds = Number.isFinite(currentSeconds)
        ? Math.max(0, currentSeconds)
        : 0;
      const sentAt = Date.now();
      const provider = providerRef.current;

      lastPersistedAtRef.current = sentAt;
      lastLocalIntentAtRef.current = sentAt;
      lastAppliedIntentAtRef.current = Math.max(
        lastAppliedIntentAtRef.current,
        sentAt,
      );
      expectedPlayerStateRef.current = isPlaying ? 1 : 2;
      lastSampleRef.current = {
        videoId: targetVideoId,
        time: safeSeconds,
        wall: sentAt,
        state: isPlaying ? 1 : 2,
        provider,
      };

      void callbacksRef.current
        .onSavePlayback(safeSeconds, isPlaying)
        .catch((saveError) => {
          console.error(
            '[ZZzzzzz] Falha ao salvar a reprodução:',
            saveError,
          );
        });

      void callbacksRef.current
        .onBroadcastPlayback({
          videoId: targetVideoId,
          videoSource: provider,
          currentTime: safeSeconds,
          isPlaying,
          playbackRate,
          sentAt,
          kind: 'intent',
        })
        .catch((broadcastError) => {
          console.error(
            '[ZZzzzzz] Falha ao transmitir a reprodução:',
            broadcastError,
          );
        });
    },
    [],
  );

  /** Applies room commands through the common YouTube-compatible player adapter. */
  const applyRoomCommand = useCallback(
    (player: any, command: PendingRoomCommand) => {
      const now = Date.now();
      const currentSeconds = Number(player.getCurrentTime?.()) || 0;
      const currentState = Number(player.getPlayerState?.());

      suppressEventsUntilRef.current = now + 1400;
      lastPersistedAtRef.current = now;

      if (Math.abs(currentSeconds - command.currentSeconds) > 1.5) {
        player.seekTo(command.currentSeconds, true);
      }

      if (command.isPlaying) {
        if (currentState !== 1) player.playVideo();
      } else if (currentState !== 2) {
        player.pauseVideo();
      }

      lastSampleRef.current = {
        videoId: command.videoId,
        time: command.currentSeconds,
        wall: now,
        state: command.isPlaying ? 1 : 2,
        provider: command.provider,
      };
      expectedPlayerStateRef.current = command.isPlaying ? 1 : 2;

      pendingRoomCommandRef.current = null;
    },
    [],
  );

  const runtime: PlaybackRuntime = {
    videoIdRef,
    providerRef,
    callbacksRef,
    pendingRoomCommandRef,
    lastLoadedVideoIdRef,
    lastAppliedSignalKeyRef,
    lastAppliedIntentAtRef,
    lastLocalIntentAtRef,
    expectedPlayerStateRef,
    suppressEventsUntilRef,
    lastPersistedAtRef,
    lastSampleRef,
  };

  return { runtime, publishPlayback, applyRoomCommand };
}
