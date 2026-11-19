import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const driver = process.env.FILE_STORAGE_DRIVER || "local";
const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION;
const localRoot = path.resolve(process.env.PRIVATE_UPLOAD_DIR || ".private-uploads");

function s3Client() {
  if (!region || !bucket) throw new Error("Private S3 storage is not completely configured");
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  return new S3Client({
    region,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {})
  });
}

export function assertPrivateStorageConfigured() {
  if (driver === "s3") {
    if (!bucket || !region) throw new Error("S3_BUCKET and S3_REGION are required for S3 storage");
    return;
  }
  if (driver !== "local") throw new Error("FILE_STORAGE_DRIVER must be 'local' or 's3'");
  if (process.env.NODE_ENV === "production") throw new Error("Production must use a private S3-compatible storage bucket");
}

export function newPrivateStorageKey(extension: string) {
  return `private/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
}

export async function putPrivateObject(key: string, body: Buffer, contentType: string) {
  assertPrivateStorageConfigured();
  if (driver === "s3") {
    await s3Client().send(new PutObjectCommand({
      Bucket: bucket!, Key: key, Body: body, ContentType: contentType,
      ServerSideEncryption: "AES256", Metadata: { visibility: "private" }
    }));
    return;
  }
  const destination = path.resolve(localRoot, key);
  if (!destination.startsWith(`${localRoot}${path.sep}`)) throw new Error("Invalid private storage key");
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, body, { flag: "wx", mode: 0o600 });
}

export async function getPrivateObject(key: string): Promise<Buffer> {
  assertPrivateStorageConfigured();
  if (driver === "s3") {
    const response = await s3Client().send(new GetObjectCommand({ Bucket: bucket!, Key: key }));
    if (!response.Body) throw new Error("Private object is unavailable");
    return Buffer.from(await response.Body.transformToByteArray());
  }
  const destination = path.resolve(localRoot, key);
  if (!destination.startsWith(`${localRoot}${path.sep}`)) throw new Error("Invalid private storage key");
  return readFile(destination);
}

export async function deletePrivateObjectStrict(key: string) {
  assertPrivateStorageConfigured();
  if (driver === "s3") {
    await s3Client().send(new DeleteObjectCommand({ Bucket: bucket!, Key: key }));
    return;
  }
  const destination = path.resolve(localRoot, key);
  if (!destination.startsWith(`${localRoot}${path.sep}`)) throw new Error("Invalid private storage key");
  await rm(destination, { force: true });
}

export async function deletePrivateObject(key: string) {
  try {
    if (driver === "s3") {
      await s3Client().send(new DeleteObjectCommand({ Bucket: bucket!, Key: key }));
      return;
    }
    const destination = path.resolve(localRoot, key);
    if (!destination.startsWith(`${localRoot}${path.sep}`)) return;
    await rm(destination, { force: true });
  } catch {
    // Cleanup is best-effort. A failed cleanup must be separately monitored and reconciled.
  }
}
