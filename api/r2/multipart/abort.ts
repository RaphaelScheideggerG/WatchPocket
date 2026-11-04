import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3';

import {
  assertValidUploadKey,
  errorResponse,
  getR2Client,
  getR2Config,
  methodNotAllowed,
  readJson,
  requireAuthenticatedUser,
} from '../../../server/r2';

type AbortBody = {
  key: string;
  uploadId: string;
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return methodNotAllowed();
    }

    try {
      await requireAuthenticatedUser(request);
      const body = await readJson<AbortBody>(request);

      assertValidUploadKey(body.key);

      if (!body.uploadId) {
        throw new Error('UploadId ausente.');
      }

      const { bucketName } = getR2Config();

      await getR2Client().send(
        new AbortMultipartUploadCommand({
          Bucket: bucketName,
          Key: body.key,
          UploadId: body.uploadId,
        }),
      );

      return Response.json({ success: true });
    } catch (error) {
      return errorResponse(error);
    }
  },
};