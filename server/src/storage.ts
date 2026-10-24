import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PDFDocument } from "pdf-lib";
import { config } from "./config";
import { HttpError } from "./shared";
import { MAX_CV_BYTES } from "@crewup/shared/hiring";
export type StorageKind = "local" | "s3";
let client: S3Client | undefined;
function s3() {
  if (!config.S3_BUCKET)
    throw new HttpError(503, "Private S3 storage is not configured.");
  return (client ??= new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    // Tigris applies bucket-specific CORS on its virtual-hosted endpoint.
    // Keep path-style support for other S3-compatible services such as MinIO.
    forcePathStyle: !!config.S3_ENDPOINT &&
      !["t3.storage.dev", "fly.storage.tigris.dev"].includes(new URL(config.S3_ENDPOINT).hostname),
    ...(config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: config.S3_ACCESS_KEY_ID,
            secretAccessKey: config.S3_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  }));
}
function filePath(key: string) {
  if (!/^[a-z0-9/.-]+$/.test(key) || key.includes(".."))
    throw new Error("Invalid storage key");
  return path.join(path.resolve(config.PRIVATE_FILES_DIR), key);
}
export async function putPrivate(
  kind: StorageKind,
  key: string,
  bytes: Buffer,
) {
  if (kind === "s3") {
    await s3().send(
      new PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: "application/pdf",
      }),
    );
  } else {
    const p = filePath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, bytes, { flag: "wx" });
  }
}
export async function readPrivate(kind: StorageKind, key: string) {
  if (kind === "s3") {
    const object = await s3().send(
      new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
    );
    if ((object.ContentLength ?? 0) > MAX_CV_BYTES)
      throw new HttpError(413, "CV must be no larger than 5 MB.");
    if (!object.Body) throw new HttpError(404, "CV upload not found.");
    return Buffer.from(await object.Body.transformToByteArray());
  }
  try {
    return await readFile(filePath(key));
  } catch {
    throw new HttpError(404, "CV file not found. Please upload it again.");
  }
}
export async function removePrivate(kind: StorageKind, key: string) {
  if (kind === "s3")
    await s3().send(
      new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
    );
  else await unlink(filePath(key)).catch(() => {});
}
export async function uploadUrl(key: string, size: number) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      ContentType: "application/pdf",
      ContentLength: size,
    }),
    { expiresIn: 300 },
  );
}
export async function validatePdf(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_CV_BYTES)
    throw new HttpError(413, "Choose a PDF no larger than 5 MB.");
  if (
    bytes.subarray(0, 5).toString() !== "%PDF-" ||
    !bytes.subarray(-1024).includes(Buffer.from("%%EOF"))
  )
    throw new HttpError(422, "This file is not a valid PDF.");
  try {
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
    });
    if (doc.getPageCount() < 1 || doc.getPageCount() > 50)
      throw new Error("page limit");
  } catch {
    throw new HttpError(
      422,
      "Use a readable, unencrypted PDF with 1–50 pages.",
    );
  }
}

export async function privateDownloadUrl(key:string,filename:string){return getSignedUrl(s3(),new GetObjectCommand({Bucket:config.S3_BUCKET,Key:key,ResponseContentType:'application/pdf',ResponseContentDisposition:`attachment; filename="cv.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`}),{expiresIn:60});}
