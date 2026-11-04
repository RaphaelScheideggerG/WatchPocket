import { useEffect, useState } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export type YouTubePlayerRef = { current: any | null };
export type PlayerMountRef = { current: HTMLDivElement | null };

export type PlayerEventHandlers = {
  onStateChange: (event: any) => void;
  onPlaybackRateChange: (event: any) => void;
  onSeeked: () => void;
  onError: (event: any) => void;
  onAutoplayBlocked: () => void;
};

let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<void>((resolve, reject) => {
    let settled = false;

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      youtubeApiPromise = null;
      reject(new Error('A API do YouTube demorou demais para carregar.'));
    }, 15000);

    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      youtubeApiPromise = null;
      reject(new Error('Não foi possível carregar a API do YouTube.'));
    };

    window.onYouTubeIframeAPIReady = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);

      if (window.YT?.Player) {
        resolve();
      } else {
        youtubeApiPromise = null;
        reject(
          new Error('A API do YouTube carregou sem disponibilizar o player.'),
        );
      }
    };

    let script = document.getElementById(
      'youtube-iframe-api',
    ) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = 'youtube-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.addEventListener('error', fail, { once: true });
      document.head.appendChild(script);
    } else {
      script.addEventListener('error', fail, { once: true });
    }
  });

  return youtubeApiPromise;
}

type UseYouTubePlayerOptions = {
  mountRef: PlayerMountRef;
  playerRef: YouTubePlayerRef;
  handlersRef: { current: PlayerEventHandlers };
  setError: (message: string) => void;
  enabled?: boolean;
};

/** Owns only the YouTube iframe player's lifecycle and event wiring. */
export function useYouTubePlayer({
  mountRef,
  playerRef,
  handlersRef,
  setError,
  enabled = true,
}: UseYouTubePlayerOptions): boolean {
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setPlayerReady(false);
      return;
    }

    let cancelled = false;
    setPlayerReady(false);

    const initializePlayer = async () => {
      try {
        await loadYouTubeApi();
        if (cancelled || !mountRef.current) return;

        const target = document.createElement('div');
        target.style.width = '100%';
        target.style.height = '100%';
        mountRef.current.replaceChildren(target);

        const player = new window.YT.Player(target, {
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              if (cancelled) {
                event.target.destroy();
                return;
              }

              playerRef.current = event.target;
              setPlayerReady(true);
              console.log('[ZZzzzzz] Player do YouTube pronto.');
            },
            onStateChange: (event: any) => {
              handlersRef.current.onStateChange(event);
            },
            onPlaybackRateChange: (event: any) => {
              handlersRef.current.onPlaybackRateChange(event);
            },
            onError: (event: any) => {
              handlersRef.current.onError(event);
            },
            onAutoplayBlocked: () => {
              handlersRef.current.onAutoplayBlocked();
            },
          },
        });

        playerRef.current = player;
      } catch (playerError) {
        if (!cancelled) {
          setError(
            playerError instanceof Error
              ? playerError.message
              : 'Não foi possível inicializar o YouTube.',
          );
        }
      }
    };

    void initializePlayer();

    return () => {
      cancelled = true;
      const player = playerRef.current;
      playerRef.current = null;

      if (player && typeof player.destroy === 'function') {
        try {
          player.destroy();
        } catch (destroyError) {
          console.warn(
            '[ZZzzzzz] Não foi possível destruir o player:',
            destroyError,
          );
        }
      }

      mountRef.current?.replaceChildren();
    };
  }, [enabled, handlersRef, mountRef, playerRef, setError]);

  return playerReady;
}
