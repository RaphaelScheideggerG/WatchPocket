const ALLOWED_VIDEO_EXTENSION = '.mp4';
const ALLOWED_VIDEO_MIME_TYPE = 'video/mp4';

export type VideoFileValidation =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Validates whether a file is an accepted video format.
 */
export function validateVideoFile(file: File): VideoFileValidation {
  const extension = file.name
    .slice(file.name.lastIndexOf('.'))
    .toLowerCase();

  if (extension !== ALLOWED_VIDEO_EXTENSION) {
    return {
      valid: false,
      error: 'Formato não suportado. Selecione um vídeo MP4.',
    };
  }

  const mimeType = file.type.trim().toLowerCase();

  // Some browsers may not provide the MIME type.
  // In that case, we use the file extension as a fallback.
  if (mimeType && mimeType !== ALLOWED_VIDEO_MIME_TYPE) {
    return {
      valid: false,
      error: 'O arquivo selecionado não é reconhecido como um vídeo MP4.',
    };
  }

  return { valid: true };
}