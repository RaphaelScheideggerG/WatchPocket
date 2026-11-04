import { supabase } from '../lib/supabase';

export type UploadedVideo = {
  key: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
};

type MultipartSession = {
  key: string;
  uploadId: string;
  partSize: number;
};

type SignPartResponse = {
  url: string;
};

type UploadedPart = {
  PartNumber: number;
  ETag: string;
};

const CONCURRENCY = 4;

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
 * Sends an authenticated request to the Vercel API.
 */
async function apiPost<T>(
  path: string,
  accessToken: string,
  payload: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.error || `Erro na API do WatchPocket (${response.status}).`,
    );
  }

  return result as T;
}

/**
 * Uploads one part directly to Cloudflare R2 using a presigned URL.
 * Returns the ETag required to complete the multipart upload.
 */
function uploadPart(
  url: string,
  blob: Blob,
  onProgress: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('PUT', url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new Error(`Falha ao enviar parte do vídeo (HTTP ${xhr.status}).`),
        );
        return;
      }

      const etag = xhr.getResponseHeader('ETag');

      if (!etag) {
        reject(
          new Error(
            'O R2 não retornou o ETag. Verifique a configuração CORS do bucket.',
          ),
        );
        return;
      }

      resolve(etag);
    };

    xhr.onerror = () => {
      reject(new Error('Erro de conexão durante o upload da parte.'));
    };

    xhr.onabort = () => {
      reject(new Error('Upload da parte interrompido.'));
    };

    xhr.send(blob);
  });
}

/**
 * Uploads a video to Cloudflare R2 using authenticated multipart uploads.
 *
 * The browser never receives the R2 credentials.
 * Upload authorization is handled by Vercel Functions.
 */
export async function uploadVideoToR2(
  file: File,
): Promise<UploadedVideo> {
  // 1. Retrieve the current Supabase session.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error('Não foi possível recuperar sua sessão.');
  }

  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error('Você precisa estar autenticado para enviar vídeos.');
  }

  const contentType = file.type || 'video/mp4';

  let multipart: MultipartSession | null = null;
  let completed = false;

  try {
    // 2. Ask Vercel to initialize the multipart upload.
    multipart = await apiPost<MultipartSession>(
      '/api/r2/multipart/create',
      accessToken,
      {
        contentType,
        sizeBytes: file.size,
      },
    );

    const { key, uploadId, partSize } = multipart;

    if (!key || !uploadId || !Number.isSafeInteger(partSize) || partSize <= 0) {
      throw new Error('Resposta inválida ao iniciar o upload.');
    }

    const partCount = Math.ceil(file.size / partSize);

    const parts: UploadedPart[] = [];
    const uploadedBytes = new Array<number>(partCount).fill(0);

    let nextPartNumber = 1;
    let stopScheduling = false;

    // Calculate total progress across concurrent uploads.
    const reportProgress = () => {
      const loaded = uploadedBytes.reduce((total, value) => total + value, 0);

      const percentage = Math.min(
        100,
        Math.round((loaded / file.size) * 100),
      );

      console.log(`[WatchPocket] Upload do vídeo: ${percentage}%`);
    };

    // 3. Upload parts concurrently.
    const worker = async () => {
      while (!stopScheduling) {
        const partNumber = nextPartNumber++;

        if (partNumber > partCount) return;

        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, file.size);

        const chunk = file.slice(start, end);

        try {
          // Request a temporary URL specifically for this part.
          const { url } = await apiPost<SignPartResponse>(
            '/api/r2/multipart/sign-part',
            accessToken,
            {
              key,
              uploadId,
              partNumber,
            },
          );

          if (!url) {
            throw new Error('A API não retornou uma URL de upload.');
          }

          // Send the video bytes directly to R2.
          const etag = await uploadPart(url, chunk, (loaded) => {
            uploadedBytes[partNumber - 1] = loaded;
            reportProgress();
          });

          uploadedBytes[partNumber - 1] = chunk.size;

          parts.push({
            PartNumber: partNumber,
            ETag: etag,
          });

          reportProgress();
        } catch (error) {
          stopScheduling = true;
          throw error;
        }
      }
    };

    const workerCount = Math.min(CONCURRENCY, partCount);

    // Wait for all workers to settle before attempting to abort.
    const workerResults = await Promise.allSettled(
      Array.from({ length: workerCount }, () => worker()),
    );

    const failedWorker = workerResults.find(
      (result) => result.status === 'rejected',
    );

    if (failedWorker?.status === 'rejected') {
      throw failedWorker.reason;
    }

    // 4. Sort parts before completing the multipart upload.
    parts.sort((a, b) => a.PartNumber - b.PartNumber);

    // 5. Ask Vercel to finalize the upload.
    await apiPost(
      '/api/r2/multipart/complete',
      accessToken,
      {
        key,
        uploadId,
        parts,
      },
    );

    completed = true;

    console.log('[WatchPocket] Upload concluído!');

    return {
      key,
      originalName: file.name,
      contentType,
      sizeBytes: file.size,
    };
  } catch (error) {
    console.error('[WatchPocket] Erro durante o multipart upload:', error);

    // 6. Attempt to cancel incomplete uploads.
    if (multipart && !completed) {
      try {
        await apiPost(
          '/api/r2/multipart/abort',
          accessToken,
          {
            key: multipart.key,
            uploadId: multipart.uploadId,
          },
        );
      } catch (abortError) {
        console.error(
          '[WatchPocket] Não foi possível cancelar o multipart upload:',
          abortError,
        );
      }
    }

    throw error;
  }
}