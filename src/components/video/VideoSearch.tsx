import type { ChangeEvent, CSSProperties, FormEvent } from 'react';
import {
  ActionIcon,
  Box,
  Group,
  Image,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Transition,
  UnstyledButton,
} from '@mantine/core';
import { IconSearch, IconPaperclip } from '@tabler/icons-react';
import type { SearchResult } from '../../utils/youtube';

type VideoSearchProps = {
  mounted: boolean;
  query: string;
  loading: boolean;
  error: string;
  results: SearchResult[];
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectVideo: (videoId: string) => void;
  onAttach?: () => void;
};

/** Search overlay: it renders the form and result list, not the player logic. */
export default function VideoSearch({
  mounted,
  query,
  loading,
  error,
  results,
  onQueryChange,
  onSubmit,
  onSelectVideo,
  onAttach,
}: VideoSearchProps) {
  return (
    <Transition mounted={mounted} transition="pop-top-left" duration={180}>
      {(transitionStyles: CSSProperties) => (
        <Box
          pos="absolute"
          top={62}
          left={14}
          right={14}
          style={{
            ...transitionStyles,
            maxWidth: 420,
            zIndex: 6,
          }}
        >
          <Stack gap={8}>
            <Paper
              component="form"
              onSubmit={onSubmit}
              p={6}
              radius="xl"
              style={{
                background: 'rgba(16, 16, 20, 0.92)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
              }}
            >
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  autoFocus
                  placeholder="Digite uma busca ou cole um link..."
                  size="sm"
                  variant="unstyled"
                  value={query}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onQueryChange(event.currentTarget.value)
                  }
                  style={{ flex: 1, paddingLeft: 10 }}
                  styles={{
                    input: {
                      color: '#fff',
                      fontSize: 13,
                    },
                  }}
                />
                <ActionIcon
                  type={query.trim() ? "submit" : "button"}
                  variant="filled"
                  color={query.trim() ? "pink" : "gray"}
                  radius="xl"
                  size="lg"
                  loading={loading}
                  aria-label={query.trim() ? "Buscar" : "Anexar arquivo"}
                  onClick={() => {
                    if (!query.trim() && onAttach) {
                      onAttach();
                    }
                  }}
                >
                  {query.trim() ? (
                    <IconSearch size={15} />
                  ) : (
                    <IconPaperclip size={15} />
                  )}
                </ActionIcon>
              </Group>
            </Paper>

            {error && (
              <Paper
                p="sm"
                radius="md"
                style={{
                  background: 'rgba(16, 16, 20, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
              >
                <Text size="xs" c="red.3">
                  {error}
                </Text>
              </Paper>
            )}

            {results.length > 0 && (
              <Paper
                p="xs"
                radius="lg"
                style={{
                  background: 'rgba(16, 16, 20, 0.94)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                }}
              >
                <ScrollArea h={240} type="auto" offsetScrollbars>
                  <Stack gap={5} pr="xs">
                    {results.map((video) => (
                      <UnstyledButton
                        key={video.videoId}
                        onClick={() => onSelectVideo(video.videoId)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: 6,
                          borderRadius: 10,
                          color: 'white',
                          textAlign: 'left',
                        }}
                      >
                        <Group wrap="nowrap" gap="sm">
                          <Image
                            src={video.thumbnailUrl}
                            alt=""
                            w={76}
                            h={43}
                            radius="sm"
                            fit="cover"
                            fallbackSrc="https://placehold.co/152x86/17171c/ffffff?text=YouTube"
                          />

                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="xs" fw={600} c="white" lineClamp={2}>
                              {video.title}
                            </Text>
                            <Text size="10px" c="gray.4" lineClamp={1} mt={3}>
                              {video.author}
                            </Text>
                          </Box>
                        </Group>
                      </UnstyledButton>
                    ))}
                  </Stack>
                </ScrollArea>
              </Paper>
            )}
          </Stack>
        </Box>
      )}
    </Transition>
  );
}
