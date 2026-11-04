import { UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

type SignPartBody = {
  key: string;
  uploadId: string;
  partNumber: number;
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return methodNotAllowed();
    }

    try {
      await requireAuthenticatedUser(request);
      const body = await readJson<SignPartBody>(request);

      assertValidUploadKey(body.key);

      if (
        !body.uploadId ||
        !Number.isInteger(body.partNumber) ||
        body.partNumber < 1 ||
        body.partNumber > 10_000
      ) {
        throw new ApiError('Dados da parte inválidos.', 400);
      }

      const { bucketName } = getR2Config();

      const command = new UploadPartCommand({
        Bucket: bucketName,
        Key: body.key,
        UploadId: body.uploadId,
        PartNumber: body.partNumber,
      });

      const url = await getSignedUrl(
        getR2Client(),
        command,
        { expiresIn: 15 * 60 },
      );

      return Response.json({ url });
    } catch (error) {
      return errorResponse(error);
    }
  },
};