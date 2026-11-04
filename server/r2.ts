import { S3Client } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }

  return value;
}

export function getR2Config() {
  return {
    endpoint: requiredEnv('R2_ENDPOINT'),
    accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    bucketName: requiredEnv('R2_BUCKET_NAME'),
  };
}

let r2Client: S3Client | undefined;

export function getR2Client(): S3Client {
  if (!r2Client) {
    const config = getR2Config();

    r2Client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return r2Client;
}

export async function requireAuthenticatedUser(request: Request) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    throw new ApiError('Autenticação necessária.', 401);
  }

  // São as mesmas credenciais públicas já utilizadas pelo frontend.
  const supabaseUrl = requiredEnv('VITE_SUPABASE_URL');
  const supabasePublishableKey = requiredEnv(
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  );

  const supabase = createClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new ApiError('Sessão inválida ou expirada.', 401);
  }

  return data.user;
}

/**
 * Validates the canonical R2 key format accepted by zz_room_state:
 * videos/<uuid>.mp4
 */
export function assertValidUploadKey(key: string): void {
  const validVideoKey = /^videos\/[0-9a-fA-F-]{36}\.mp4$/;

  if (typeof key !== 'string' || !validVideoKey.test(key)) {
    throw new ApiError('Chave de vídeo inválida.', 400);
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError('Corpo da requisição inválido.', 400);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: error.message },
      { status: error.status },
    );
  }

  console.error('[WatchPocket API]', error);

  return Response.json(
    { error: 'Erro interno ao processar o upload.' },
    { status: 500 },
  );
}

export function methodNotAllowed(): Response {
  return Response.json(
    { error: 'Método não permitido.' },
    { status: 405 },
  );
}
