import type { PlaybackSignal, RoomState } from './useZzzRoom';
import type { PlayerEventHandlers, YouTubePlayerRef, } from './useYouTubePlayer';

import type { BroadcastPlayback, SavePlayback, } from '../hooks/playbackSyncTypes';

import { usePlaybackRuntime } from './usePlaybackRuntime';
import { useRoomPlaybackCommands } from './useRoomPlaybackCommands';
import { usePlaybackSignals } from './usePlaybackSignals';

type UsePlaybackSyncOptions = {
  roomState: RoomState | null;
  videoId: string | null;
  playbackSignal: PlaybackSignal | null;
  userId: string | null;
  playerReady: boolean;
  playerRef: YouTubePlayerRef;
  handlersRef: { current: PlayerEventHandlers };
  onSavePlayback: SavePlayback;
  onBroadcastPlayback: BroadcastPlayback;
  setError: (message: string) => void;
};

/** Composes the smaller hooks that coordinate playback across the room. */
export function usePlaybackSync({
  roomState,
  videoId,
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
    onSavePlayback,
    onBroadcastPlayback,
  });

  const restartVideo = useRoomPlaybackCommands({
    roomState,
    videoId,
    playerReady,
    playerRef,
    runtime,
    applyRoomCommand,
    setError,
  });

  usePlaybackSignals({
    playbackSignal,
    videoId,
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
