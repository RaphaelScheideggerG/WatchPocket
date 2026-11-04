import { useCallback, useEffect, useState } from 'react';
import type { PlaybackSignal } from './useZzzRoom';
import type {
  PendingRoomCommand,
  PlaybackRuntime,
  VideoProviderType,
} from './playbackSyncTypes';
import type {
  PlayerEventHandlers,
  YouTubePlayerRef,
} from './useYouTubePlayer';

type UsePlaybackSignalsOptions = {
  playbackSignal: PlaybackSignal | null;
  videoId: string | null;
  videoSource: VideoProviderType;
  userId: string | null;
  playerReady: boolean;
  playerRef: YouTubePlayerRef;
  handlersRef: { current: PlayerEventHandlers };
  runtime: PlaybackRuntime;
  publishPlayback: (
    videoId: string,
    currentSeconds: number,
    isPlaying: boolean,
    playbackRate?: number,
  ) => void;
  applyRoomCommand: (player: any, command: PendingRoomCommand) => void;
  setError: (message: string) => void;
};

/** Handles native/YouTube player events, room signals, and periodic checkpoints. */
export function usePlaybackSignals({
  playbackSignal,
  videoId,
  videoSource,
  userId,
  playerReady,
  playerRef,
  handlersRef,
  runtime,
  publishPlayback,
  applyRoomCommand,
  setError,
}: UsePlaybackSignalsOptions) {
  const [speed, setSpeed] = useState(1);
  const {
    videoIdRef,
    providerRef,
    callbacksRef,
    pendingRoomCommandRef,
    lastAppliedSignalKeyRef,
    lastAppliedIntentAtRef,
    lastLocalIntentAtRef,
    expectedPlayerStateRef,
    suppressEventsUntilRef,
    lastPersistedAtRef,
    lastSampleRef,
  } = runtime;

  const handlePlayerStateChange = useCallback(
    (event: any) => {
      if (event.data !== 1 && event.data !== 2) return;

      const player = event.target;
      const reportedVideoId =
        player.getVideoData?.()?.video_id ?? videoIdRef.current;
      if (!reportedVideoId) return;

      const reportedProvider = providerRef.current;
      const pendingCommand = pendingRoomCommandRef.current;

      if (
        pendingCommand &&
        pendingCommand.videoId === reportedVideoId &&
        pendingCommand.provider === reportedProvider
      ) {
        applyRoomCommand(player, pendingCommand);
        return;
      }

      if (
        Date.now() < suppressEventsUntilRef.current &&
        event.data === expectedPlayerStateRef.current
      ) {
        return;
      }

      publishPlayback(
        reportedVideoId,
        Number(player.getCurrentTime?.()) || 0,
        event.data === 1,
        Number(player.getPlaybackRate?.()) || speed,
      );
    },
    [
      applyRoomCommand,
      expectedPlayerStateRef,
      pendingRoomCommandRef,
      providerRef,
      publishPlayback,
      suppressEventsUntilRef,
      videoIdRef,
      speed,
    ],
  );

  const handlePlaybackRateChange = useCallback((event: any) => {
    if (Number.isFinite(event.data)) setSpeed(event.data);
  }, []);

  const handleSeeked = useCallback(() => {
    if (Date.now() < suppressEventsUntilRef.current) return;

    const player = playerRef.current;
    const activeVideoId =
      player?.getVideoData?.()?.video_id ?? videoIdRef.current;
    const state = Number(player?.getPlayerState?.());

    if (!player || !activeVideoId || (state !== 1 && state !== 2)) return;

    publishPlayback(
      activeVideoId,
      Number(player.getCurrentTime?.()) || 0,
      state === 1,
      Number(player.getPlaybackRate?.()) || speed,
    );
  }, [playerRef, publishPlayback, speed, suppressEventsUntilRef, videoIdRef]);

  const handlePlayerError = useCallback(
    (event: any) => {
      const messages: Record<number, string> = {
        2: 'O YouTube recebeu um ID de vídeo inválido.',
        5: 'Este vídeo não pode ser reproduzido pelo player HTML5.',
        100: 'O vídeo foi removido, não existe ou é privado.',
        101: 'O proprietário não permite reproduzir este vídeo fora do YouTube.',
        150: 'O proprietário não permite reproduzir este vídeo fora do YouTube.',
        153: 'O YouTube não identificou a origem do player. Confira HTTPS e as configurações de referrer.',
      };

      setError(
        messages[event.data] ?? `O YouTube retornou o erro ${event.data}.`,
      );
    },
    [setError],
  );

  const handleAutoplayBlocked = useCallback(() => {
    setError(
      'A reprodução automática foi bloqueada pelo navegador. Pressione Play no player para permitir a reprodução.',
    );
  }, [setError]);

  // Both player implementations dispatch this common event shape.
  handlersRef.current = {
    onStateChange: handlePlayerStateChange,
    onPlaybackRateChange: handlePlaybackRateChange,
    onSeeked: handleSeeked,
    onError: handlePlayerError,
    onAutoplayBlocked: handleAutoplayBlocked,
  };

  // Apply low-latency commands received from another participant.
  useEffect(() => {
    const player = playerRef.current;
    const signal = playbackSignal;

    if (
      !playerReady ||
      !player ||
      !signal ||
      !videoId ||
      signal.userId === userId ||
      signal.videoId !== videoId ||
      (signal.videoSource ?? 'youtube') !== videoSource ||
      !Number.isFinite(signal.currentTime) ||
      typeof signal.isPlaying !== 'boolean'
    ) {
      return;
    }

    const signalKey =
      `${signal.userId}:${signal.videoSource ?? 'youtube'}:${signal.videoId}:${signal.sentAt}:${signal.isPlaying}`;
    if (lastAppliedSignalKeyRef.current === signalKey) return;
    lastAppliedSignalKeyRef.current = signalKey;

    if (
      pendingRoomCommandRef.current?.videoId === signal.videoId &&
      pendingRoomCommandRef.current.provider === videoSource
    ) {
      return;
    }

    const kind = signal.kind === 'heartbeat' ? 'heartbeat' : 'intent';
    const targetSeconds = Math.max(0, signal.currentTime);
    const currentSeconds = Number(player.getCurrentTime?.()) || 0;
    const currentState = Number(player.getPlayerState?.());

    if (
      kind === 'intent' &&
      signal.sentAt < lastAppliedIntentAtRef.current
    ) {
      return;
    }

    if (
      kind === 'intent' &&
      lastLocalIntentAtRef.current > signal.sentAt
    ) {
      return;
    }

    const willSeek = Math.abs(currentSeconds - targetSeconds) > 1.75;
    const willPlay =
      kind === 'intent' && signal.isPlaying && currentState !== 1;
    const willPause =
      kind === 'intent' && !signal.isPlaying && currentState !== 2;
    const heartbeatSeek =
      kind === 'heartbeat' &&
      signal.isPlaying &&
      currentState === 1 &&
      willSeek;

    if (kind === 'heartbeat' && !heartbeatSeek) return;

    const targetRate = Number(signal.playbackRate);
    if (
      Number.isFinite(targetRate) &&
      targetRate > 0 &&
      typeof player.setPlaybackRate === 'function'
    ) {
      player.setPlaybackRate(targetRate);
      setSpeed(targetRate);
    }

    suppressEventsUntilRef.current = Date.now() + 1100;

    if (heartbeatSeek || willSeek) player.seekTo(targetSeconds, true);
    if (willPlay) player.playVideo();
    else if (willPause) player.pauseVideo();

    if (kind === 'intent') {
      lastAppliedIntentAtRef.current = Math.max(
        lastAppliedIntentAtRef.current,
        signal.sentAt,
      );
    }

    expectedPlayerStateRef.current = willPlay
      ? 1
      : willPause
        ? 2
        : currentState;

    lastSampleRef.current = {
      videoId: signal.videoId,
      time: targetSeconds,
      wall: Date.now(),
      state: signal.isPlaying ? 1 : 2,
      provider: videoSource,
    };
  }, [
    lastAppliedIntentAtRef,
    lastAppliedSignalKeyRef,
    lastLocalIntentAtRef,
    expectedPlayerStateRef,
    lastSampleRef,
    pendingRoomCommandRef,
    playbackSignal,
    playerReady,
    playerRef,
    suppressEventsUntilRef,
    userId,
    videoId,
    videoSource,
  ]);

  // Broadcast position every two seconds and persist periodic checkpoints.
  useEffect(() => {
    if (!playerReady) return;

    const intervalId = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || Date.now() < suppressEventsUntilRef.current) return;

      const playerState = Number(player.getPlayerState?.());
      if (playerState !== 1 && playerState !== 2) return;

      const activeVideoId =
        player.getVideoData?.()?.video_id ?? videoIdRef.current;
      if (!activeVideoId) return;
      const pendingCommand = pendingRoomCommandRef.current;
      if (
        pendingCommand &&
        pendingCommand.videoId === activeVideoId &&
        pendingCommand.provider === providerRef.current
      ) {
        return;
      }

      const now = Date.now();
      const currentSeconds = Number(player.getCurrentTime?.()) || 0;
      const isPlaying = playerState === 1;
      const currentProvider = providerRef.current;
      const previous = lastSampleRef.current;

      let stateChanged = false;
      let seeked = false;

      if (
        previous &&
        previous.videoId === activeVideoId &&
        previous.provider === currentProvider
      ) {
        stateChanged = previous.state !== playerState;

        const elapsedSeconds = Math.max(0, (now - previous.wall) / 1000);
        const expectedSeconds =
          previous.time + (previous.state === 1 ? elapsedSeconds : 0);
        const difference = Math.abs(currentSeconds - expectedSeconds);

        seeked = previous.state === playerState && difference > 2.25;
      }

      void callbacksRef.current
        .onBroadcastPlayback({
          videoId: activeVideoId,
          videoSource: currentProvider,
          currentTime: currentSeconds,
          isPlaying,
          playbackRate: Number(player.getPlaybackRate?.()) || speed,
          sentAt: now,
          // A seek while paused must be applied remotely too, so publish it as
          // an intent rather than a passive heartbeat.
          kind: seeked ? 'intent' : 'heartbeat',
        })
        .catch((broadcastError) => {
          console.error(
            '[ZZzzzzz] Falha ao sincronizar o player:',
            broadcastError,
          );
        });

      const shouldPersist =
        stateChanged ||
        seeked ||
        (isPlaying && now - lastPersistedAtRef.current >= 15000);

      if (shouldPersist) {
        lastPersistedAtRef.current = now;
        void callbacksRef.current
          .onSavePlayback(currentSeconds, isPlaying)
          .catch((saveError) => {
            console.error(
              '[ZZzzzzz] Falha ao persistir a posição:',
              saveError,
            );
          });
      }

      lastSampleRef.current = {
        videoId: activeVideoId,
        time: currentSeconds,
        wall: now,
        state: playerState,
        provider: currentProvider,
      };
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [
    callbacksRef,
    lastPersistedAtRef,
    lastSampleRef,
    pendingRoomCommandRef,
    playerReady,
    playerRef,
    providerRef,
    suppressEventsUntilRef,
    videoIdRef,
    speed,
  ]);

  // Keep supported playback-rate controls aligned between participants.
  useEffect(() => {
    const player = playerRef.current;

    if (
      playerReady &&
      player &&
      typeof player.setPlaybackRate === 'function'
    ) {
      player.setPlaybackRate(speed);
    }
  }, [playerReady, playerRef, speed]);
}
