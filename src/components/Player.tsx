import { Box } from '@mantine/core';

import type {
  ChatMessage,
  RoomState,
  PlaybackSignal,
} from '../hooks/useZzzRoom';
import type { VideoProviderType } from '../hooks/playbackSyncTypes';

import Video from './video/Video';
import Chat from './Chat';

type PlayerProps = {
  roomState: RoomState | null;
  onSelectVideo: (videoId: string, videoSource?: VideoProviderType) => Promise<void>;

  // Dados e ações do chat.
  messages: ChatMessage[];
  userId: string | null;
  onSendMessage: (body: string) => Promise<void>;

  // Dados e ações de sincronização do player.
  playbackSignal: PlaybackSignal | null;

  onSavePlayback: (
    currentSeconds: number,
    isPlaying: boolean,
    playbackRate?: number,
  ) => Promise<void>;

  onBroadcastPlayback: (
    signal: Omit<PlaybackSignal, 'userId'>,
  ) => Promise<void>;
};

export default function Player({
  roomState,
  onSelectVideo,
  messages,
  userId,
  onSendMessage,
  playbackSignal,
  onSavePlayback,
  onBroadcastPlayback,
}: PlayerProps) {
  return (
    <Box
      pos="relative"
      w="100%"
      h="100%"
      bg="#000000"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Video
        roomState={roomState}
        onSelectVideo={onSelectVideo}
        playbackSignal={playbackSignal}
        userId={userId}
        onSavePlayback={onSavePlayback}
        onBroadcastPlayback={onBroadcastPlayback}
      />

      <Chat
        messages={messages}
        userId={userId}
        onSendMessage={onSendMessage}
      />
    </Box>
  );
}