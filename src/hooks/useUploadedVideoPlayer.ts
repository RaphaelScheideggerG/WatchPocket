import { useEffect, useRef, useState } from 'react';
import type {
  PlayerEventHandlers,
  YouTubePlayerRef,
} from './useYouTubePlayer';

type VideoElementRef = { current: HTMLVideoElement | null };

type UseUploadedVideoPlayerOptions = {
  enabled: boolean;
  videoId: string | null;
  videoRef: VideoElementRef;
  playerRef: YouTubePlayerRef;
  handlersRef: { current: PlayerEventHandlers };
  setError: (message: string) => void;
};

type LoadVideoOptions = {
  videoId: string;
  startSeconds?: number;
};

/**
 * Adapts the native HTMLVideoElement API to the small player API used by the
 * existing playback synchronization hooks.
 */
export function useUploadedVideoPlayer({
  enabled,
  videoId,
  videoRef,
  playerRef,
  handlersRef,
  setError,
}: UseUploadedVideoPlayerOptions): boolean {
  const [playerReady, setPlayerReady] = useState(false);
  const videoIdRef = useRef<string | null>(videoId);
  const loadedVideoIdRef = useRef<string | null>(null);
  const pendingStartSecondsRef = useRef<number | null>(null);

  videoIdRef.current = videoId;

  useEffect(() => {
    const video = videoRef.current;

    if (!enabled || !video) {
      setPlayerReady(false);
      return;
    }

    const media = video;
    let disposed = false;

    const adapter = {
      getCurrentTime: () => media.currentTime || 0,
      getPlayerState: () => (media.paused || media.ended ? 2 : 1),
      getPlaybackRate: () => media.playbackRate || 1,
      setPlaybackRate: (rate: number) => {
        if (Number.isFinite(rate) && rate > 0) media.playbackRate = rate;
      },
      seekTo: (seconds: number) => {
        if (!Number.isFinite(seconds) || media.readyState < HTMLMediaElement.HAVE_METADATA) {
          return;
        }
        media.currentTime = Math.max(0, seconds);
      },
      playVideo: () => {
        void media.play().catch(() => {
          handlersRef.current.onAutoplayBlocked();
        });
      },
      pauseVideo: () => media.pause(),
      getVideoData: () =>
        media.readyState >= HTMLMediaElement.HAVE_METADATA
          ? { video_id: videoIdRef.current }
          : { video_id: null },
      loadVideoById: ({ videoId: nextVideoId, startSeconds = 0 }: LoadVideoOptions) => {
        videoIdRef.current = nextVideoId;
        pendingStartSecondsRef.current = Math.max(0, startSeconds);

        // React has already committed the new src before this room-command
        // effect runs. Calling load() resets any metadata from the previous
        // file, so the pending room command is applied to the correct video.
        if (loadedVideoIdRef.current !== nextVideoId) {
          loadedVideoIdRef.current = nextVideoId;
          media.load();
          return;
        }

        // Selecting the same item again is a restart, not a new download.
        if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
          queueMicrotask(handleLoadedMetadata);
        }
      },
    };

    const notifyState = () => {
      if (disposed) return;
      const state = media.paused || media.ended ? 2 : 1;
      if (state === 1 || state === 2) {
        handlersRef.current.onStateChange({ data: state, target: adapter });
      }
    };

    function handleLoadedMetadata() {
      if (disposed) return;

      const pendingStart = pendingStartSecondsRef.current;
      if (pendingStart === null) return;

      pendingStartSecondsRef.current = null;
      try {
        media.currentTime = pendingStart;
      } catch (seekError) {
        console.warn('[ZZzzzzz] Não foi possível posicionar o vídeo:', seekError);
      }

      notifyState();
    }

    const handlePlay = () => notifyState();
    const handlePause = () => {
      // Changing src can emit pause before the new media has metadata.
      if (media.readyState >= HTMLMediaElement.HAVE_METADATA) notifyState();
    };
    const handleRateChange = () => {
      handlersRef.current.onPlaybackRateChange({ data: media.playbackRate });
    };
    const handleSeeked = () => handlersRef.current.onSeeked();
    const handleError = () => {
      const detail = media.error?.message;
      setError(
        detail
          ? `Não foi possível reproduzir o vídeo: ${detail}`
          : 'Não foi possível carregar o vídeo armazenado no R2. Confira o endereço público e as permissões do bucket.',
      );
    };

    media.addEventListener('loadedmetadata', handleLoadedMetadata);
    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);
    media.addEventListener('ratechange', handleRateChange);
    media.addEventListener('seeked', handleSeeked);
    media.addEventListener('ended', notifyState);
    media.addEventListener('error', handleError);

    playerRef.current = adapter;
    setPlayerReady(true);

    // Metadata may have loaded before this effect attached its listeners.
    if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
      queueMicrotask(handleLoadedMetadata);
    }

    return () => {
      disposed = true;
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('ratechange', handleRateChange);
      media.removeEventListener('seeked', handleSeeked);
      media.removeEventListener('ended', notifyState);
      media.removeEventListener('error', handleError);

      if (playerRef.current === adapter) playerRef.current = null;
      pendingStartSecondsRef.current = null;
      loadedVideoIdRef.current = null;
    };
  }, [enabled, handlersRef, playerRef, setError, videoRef]);

  return playerReady;
}
