import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';

import {
  ApiError,
  assertValidUploadKey,
  errorResponse,
  getR2Client,
  getR2Config,
  methodNotAllowed,
  readJson,
  requireAuthenticatedUser,
} from '../../../server/r2';

type CompleteBody = {
  key: string;
  uploadId: string;
  parts: {
    PartNumber: number;
    ETag: string;
  }[];
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return methodNotAllowed();
    }

    try {
      await requireAuthenticatedUser(request);
      const body = await readJson<CompleteBody>(request);

      assertValidUploadKey(body.key);

      if (
        !body.uploadId ||
        !Array.isArray(body.parts) ||
        body.parts.length < 1 ||
        body.parts.length > 10_000
      ) {
        throw new ApiError('Lista de partes inválida.', 400);
      }

      const parts = [...body.parts].sort(
        (a, b) => a.PartNumber - b.PartNumber,
      );

      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];

        if (
          part.PartNumber !== index + 1 ||
          typeof part.ETag !== 'string' ||
          !part.ETag.trim()
        ) {
          throw new ApiError('Identificadores de partes inválidos.', 400);
        }
      }

      const { bucketName } = getR2Config();

      const result = await getR2Client().send(
        new CompleteMultipartUploadCommand({
          Bucket: bucketName,
          Key: body.key,
          UploadId: body.uploadId,
          MultipartUpload: {
            Parts: parts,
          },
        }),
      );

      return Response.json({
        key: body.key,
        etag: result.ETag,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
};