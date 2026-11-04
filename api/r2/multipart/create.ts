import { randomUUID } from 'node:crypto';
import { CreateMultipartUploadCommand } from '@aws-sdk/client-s3';

import {
  ApiError,
  errorResponse,
  getR2Client,
  getR2Config,
  methodNotAllowed,
  readJson,
  requireAuthenticatedUser,
} from '../../../server/r2.ts';

type CreateBody = {
  contentType: string;
  sizeBytes: number;
};

const PART_SIZE = 10 * 1024 * 1024;
const MAX_PARTS = 10_000;

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return methodNotAllowed();
    }

    try {
      const user = await requireAuthenticatedUser(request);
      const body = await readJson<CreateBody>(request);

      const contentType = body.contentType?.trim() || 'video/mp4';
      const sizeBytes = Number(body.sizeBytes);

      if (!contentType.startsWith('video/')) {
        throw new ApiError('Tipo de arquivo inválido.', 400);
      }

      if (
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes <= 0 ||
        sizeBytes > PART_SIZE * MAX_PARTS
      ) {
        throw new ApiError('Tamanho de arquivo inválido ou acima do limite.', 400);
      }

      const { bucketName } = getR2Config();
      const key = `videos/${randomUUID()}.mp4`;

      const result = await getR2Client().send(
        new CreateMultipartUploadCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: contentType,
          Metadata: {
            owner: user.id,
          },
        }),
      );

      if (!result.UploadId) {
        throw new Error('O R2 não retornou um UploadId.');
      }

      return Response.json({
        key,
        uploadId: result.UploadId,
        partSize: PART_SIZE,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
};