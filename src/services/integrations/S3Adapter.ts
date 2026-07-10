import { IntegrationAdapter } from "./IntegrationAdapter.js";

export interface S3PresignedUrlInput {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  key: string;
  contentType?: string;
}

export interface S3PresignedUrlResult {
  uploadUrl: string;
  publicUrl: string;
  expiresIn: number;
}

// Same AWS SDK v3 presigned-URL generation as the original inline handler —
// no raw fetch for this one, the SDK IS the protocol.
export class S3Adapter implements IntegrationAdapter<S3PresignedUrlInput, S3PresignedUrlResult> {
  async send(input: S3PresignedUrlInput): Promise<S3PresignedUrlResult> {
    const { accessKeyId, secretAccessKey, region, bucket, key, contentType } = input;

    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType || "application/octet-stream" });
    const expiresIn = 300;
    const uploadUrl = await getSignedUrl(client, command, { expiresIn });
    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    return { uploadUrl, publicUrl, expiresIn };
  }
}
