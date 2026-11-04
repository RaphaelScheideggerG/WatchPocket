import type { MutableRefObject } from 'react';
import type { PlaybackSignal } from './useZzzRoom';

export type VideoProviderType = 'youtube' | 'upload';

export type PendingRoomCommand = {
  videoId: string; // can be a youtube video id or a upload video url
  currentSeconds: number;
  isPlaying: boolean;
  provider: VideoProviderType;
};

export type PlaybackSample = {
  videoId: string;
  time: number;
  wall: number;
  state: number;
  provider: VideoProviderType;
};

export type SavePlayback = (
  currentSeconds: number,
  isPlaying: boolean,
  playbackRate?: number,
) => Promise<void>;

export type BroadcastPlayback = (
  signal: Omit<PlaybackSignal, 'userId'>,
) => Promise<void>;

export type PlaybackRuntime = {
  videoIdRef: MutableRefObject<string | null>;
  providerRef: MutableRefObject<VideoProviderType>;
  callbacksRef: MutableRefObject<{
    onSavePlayback: SavePlayback;
    onBroadcastPlayback: BroadcastPlayback;
  }>;
  pendingRoomCommandRef: MutableRefObject<PendingRoomCommand | null>;
  lastLoadedVideoIdRef: MutableRefObject<string | null>;
  lastAppliedRoomCommandKeyRef: MutableRefObject<string | null>;
  hasAppliedRoomCommandRef: MutableRefObject<boolean>;
  lastAppliedSignalKeyRef: MutableRefObject<string | null>;
  lastAppliedIntentAtRef: MutableRefObject<number>;
  lastLocalIntentAtRef: MutableRefObject<number>;
  expectedPlayerStateRef: MutableRefObject<number | null>;
  suppressEventsUntilRef: MutableRefObject<number>;
  lastPersistedAtRef: MutableRefObject<number>;
  lastSampleRef: MutableRefObject<PlaybackSample | null>;
};
