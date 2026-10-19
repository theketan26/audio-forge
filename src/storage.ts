import fs from 'node:fs';
import dotenv from 'dotenv';
import { AwsClient } from 'aws4fetch';

dotenv.config();

export interface R2UploadResult {
  key: string;
  storageUri: string;
  secureSignedUrl: string;
  bucket: string;
}

export class CloudflareR2StorageService {
  private client: AwsClient | null = null;
  private endpoint: string;
  private bucket: string;
  private isConfigured = false;

  constructor(customBucket?: string) {
    // 1. Resolve R2 S3 API endpoint
    let rawEndpoint =
      process.env.R2_S3_API_URL ||
      process.env.R2_ENDPOINT ||
      '';

    // 2. Resolve bucket
    this.bucket =
      customBucket ||
      process.env.R2_BUCKET_NAME ||
      '';

    // If user pasted an endpoint that already includes the bucket name at the end, normalize it
    if (rawEndpoint) {
      rawEndpoint = rawEndpoint.trim().replace(/\/+$/, '');
      if (this.bucket && rawEndpoint.endsWith(`/${this.bucket}`)) {
        rawEndpoint = rawEndpoint.substring(0, rawEndpoint.length - (this.bucket.length + 1));
      }
    }
    this.endpoint = rawEndpoint;

    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

    if (this.endpoint && accessKeyId && secretAccessKey && this.bucket) {
      try {
        this.client = new AwsClient({
          accessKeyId,
          secretAccessKey,
          service: 's3',
          region: 'auto',
        });
        this.isConfigured = true;
      } catch (err) {
        console.warn('Warning: Could not initialize Cloudflare R2 client:', err);
      }
    }
  }

  public get configured(): boolean {
    return this.isConfigured;
  }

  /**
   * Upload a local file to Cloudflare R2 securely with private permissions
   */
  public async uploadFile(
    localFilePath: string,
    storageKey: string,
    contentType = 'application/octet-stream',
    signedUrlExpiresSeconds = 3600
  ): Promise<R2UploadResult> {
    if (!this.client || !this.isConfigured) {
      throw new Error(
        'Cloudflare R2 is not fully configured. Please check R2_S3_API_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in .env.'
      );
    }

    const fileBuffer = fs.readFileSync(localFilePath);
    const cleanKey = storageKey.replace(/^\/+/, '');
    const objectUrl = `${this.endpoint}/${this.bucket}/${cleanKey}`;

    // 1. Secure PUT to Cloudflare R2 (Private bucket storage)
    const uploadResponse = await this.client.fetch(objectUrl, {
      method: 'PUT',
      body: fileBuffer,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileBuffer.length),
      },
    });

    if (!uploadResponse.ok) {
      const errBody = await uploadResponse.text().catch(() => '');
      throw new Error(
        `R2 upload failed (HTTP ${uploadResponse.status}): ${errBody || uploadResponse.statusText}`
      );
    }

    // 2. Generate a secure, time-limited presigned URL for private access without public bucket
    const signedRequest = await this.client.sign(
      `${objectUrl}?X-Amz-Expires=${signedUrlExpiresSeconds}`,
      {
        method: 'GET',
        aws: { signQuery: true },
      }
    );

    return {
      key: cleanKey,
      storageUri: `r2://${this.bucket}/${cleanKey}`,
      secureSignedUrl: signedRequest.url,
      bucket: this.bucket,
    };
  }
}
