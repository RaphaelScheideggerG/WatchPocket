export type UploadedVideo = {
    key: string;
    originalName: string;
    contentType: string;
    sizeBytes: number;
  };
  
/**
 * Uploads a video file to Cloudflare R2 using Multipart Upload for large files.
 */
export async function uploadVideoToR2(file: File,): Promise<UploadedVideo> {
    // 1. Recupera as configurações do ambiente.
    // TODO: migrar para secret manager.
    const endpoint = import.meta.env.VITE_R2_ENDPOINT;
    const accessKeyId = import.meta.env.VITE_R2_ACCESS_KEY_ID;
    const secretAccessKey = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;
    const bucketName = import.meta.env.VITE_R2_BUCKET_NAME;

    // 2. Verifica se todas as configurações necessárias existem.
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
        throw new Error('Configurações do Cloudflare R2 incompletas.');
    }

    // 3. Importa o SDK do S3 e a lib-storage dinamicamente.
    const { S3Client } = await import('@aws-sdk/client-s3');
    const { Upload } = await import('@aws-sdk/lib-storage');

    // 4. Inicializa o cliente do R2.
    const r2Client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: {
        accessKeyId,
        secretAccessKey,
        },
    });

    // 5. Gera uma chave única para o objeto.
    const key = `videos/${crypto.randomUUID()}.mp4`;
    const contentType = file.type || 'video/mp4';

    try {
        // 6. Configura o gerenciador de upload gerenciado (Multipart automático)
        const parallelUploads3 = new Upload({
        client: r2Client,
        params: {
            Bucket: bucketName,
            Key: key,
            Body: file, // A lib-storage aceita o File nativo e o transforma em stream/chunks internamente
            ContentType: contentType,
        },
        // Configurações opcionais para otimizar o upload:
        queueSize: 4,          // Quantidade de partes enviadas em paralelo (bom para conexões rápidas)
        partSize: 1024 * 1024 * 10, // Tamanho de cada pedaço: 10MB (Mínimo recomendado para arquivos grandes no S3/R2 é 5MB)
        });

        // Opcional: Se quiser acompanhar a porcentagem do progresso no console enquanto testa:
        parallelUploads3.on("httpUploadProgress", (progress) => {
        if (progress.loaded && progress.total) {
            const percentage = Math.round((progress.loaded / progress.total) * 100);
            console.log(`Upload do filme: ${percentage}% concluído`);
        }
        });

        // 7. Executa o upload multipart completo.
        await parallelUploads3.done();

        // 8. Retorna os dados do arquivo armazenado.
        return {
        key,
        originalName: file.name,
        contentType,
        sizeBytes: file.size,
        };
    } catch (error) {
        console.error("Erro ao realizar o multipart upload no R2:", error);
        throw error;
    }
}
