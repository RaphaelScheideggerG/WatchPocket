export type UploadedVideo = {
  key: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
};

/**
 * Builds the browser playback URL for an R2 object.
 * The bucket must have public access enabled through a custom domain or r2.dev.
 */
export function getR2PublicVideoUrl(key: string): string | null {
  const publicBaseUrl = import.meta.env.VITE_R2_PUBLIC_BASE_URL?.trim();
  if (!publicBaseUrl) return null;

  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${publicBaseUrl.replace(/\/+$/, '')}/${encodedKey}`;
}

/**
 * Uploads a video file to Cloudflare R2 using Multipart Upload for large files.
 * This browser-side credential approach is for local experimentation only.
 */
export async function uploadVideoToR2(file: File): Promise<UploadedVideo> {
  const endpoint = import.meta.env.VITE_R2_ENDPOINT;
  const accessKeyId = import.meta.env.VITE_R2_ACCESS_KEY_ID;
  const secretAccessKey = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;
  const bucketName = import.meta.env.VITE_R2_BUCKET_NAME;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('Configurações do Cloudflare R2 incompletas.');
  }

  const { S3Client } = await import('@aws-sdk/client-s3');
  const { Upload } = await import('@aws-sdk/lib-storage');

  const r2Client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const key = `videos/${crypto.randomUUID()}.mp4`;
  const contentType = file.type || 'video/mp4';

  try {
    const multipartUpload = new Upload({
      client: r2Client,
      params: {
        Bucket: bucketName,
        Key: key,
        Body: file,
        ContentType: contentType,
      },
      queueSize: 4,
      partSize: 10 * 1024 * 1024,
    });

    multipartUpload.on('httpUploadProgress', (progress) => {
      if (progress.loaded && progress.total) {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        console.log(`[ZZzzzzz] Upload do vídeo: ${percentage}%`);
      }
    });

    await multipartUpload.done();

    return {
      key,
      originalName: file.name,
      contentType,
      sizeBytes: file.size,
    };
  } catch (error) {
    console.error('[ZZzzzzz] Erro durante o multipart upload no R2:', error);
    throw error;
  } finally {
    r2Client.destroy();
  }
}
