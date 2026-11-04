import type { PlaybackSignal, RoomState } from './useZzzRoom';
import type { PlayerEventHandlers, YouTubePlayerRef } from './useYouTubePlayer';
import type {
  BroadcastPlayback,
  SavePlayback,
  VideoProviderType,
} from './playbackSyncTypes';

import { usePlaybackRuntime } from './usePlaybackRuntime';
import { useRoomPlaybackCommands } from './useRoomPlaybackCommands';
import { usePlaybackSignals } from './usePlaybackSignals';

type UsePlaybackSyncOptions = {
  roomState: RoomState | null;
  videoId: string | null;
  videoSource: VideoProviderType;
  playbackSignal: PlaybackSignal | null;
  userId: string | null;
  playerReady: boolean;
  playerRef: YouTubePlayerRef;
  handlersRef: { current: PlayerEventHandlers };
  onSavePlayback: SavePlayback;
  onBroadcastPlayback: BroadcastPlayback;
  setError: (message: string) => void;
};

/** Composes the playback hooks for both YouTube and native HTML video players. */
export function usePlaybackSync({
  roomState,
  videoId,
  videoSource,
  playbackSignal,
  userId,
  playerReady,
  playerRef,
  handlersRef,
  onSavePlayback,
  onBroadcastPlayback,
  setError,
}: UsePlaybackSyncOptions) {
  const { runtime, publishPlayback, applyRoomCommand } = usePlaybackRuntime({
    videoId,
    videoSource,
    onSavePlayback,
    onBroadcastPlayback,
  });

  const restartVideo = useRoomPlaybackCommands({
    roomState,
    videoId,
    videoSource,
    playerReady,
    playerRef,
    runtime,
    setError,
  });

  usePlaybackSignals({
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
  });

  return { restartVideo };
}
