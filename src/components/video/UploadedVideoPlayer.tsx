import { forwardRef } from 'react';

type UploadedVideoPlayerProps = {
  src: string | null;
  visible: boolean;
};

/** Renders an R2-hosted MP4 using the browser's native video element. */
const UploadedVideoPlayer = forwardRef<
  HTMLVideoElement,
  UploadedVideoPlayerProps
>(function UploadedVideoPlayer({ src, visible }, ref) {
  return (
    <video
      ref={ref}
      src={src ?? undefined}
      controls={visible}
      playsInline
      preload={visible ? 'metadata' : 'none'}
      aria-label="Vídeo enviado para a sala"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        background: '#000',
        display: visible ? 'block' : 'none',
      }}
    />
  );
});

export default UploadedVideoPlayer;
