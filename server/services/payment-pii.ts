import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

function readKey(name: string): Buffer | null {
  const value = process.env[name]?.trim();
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) return null;
  return Buffer.from(value, "hex");
}

export function activePaymentPiiVersion(): string {
  const version = process.env.PAYMENT_PII_ACTIVE_KEY_VERSION?.trim() || "v1";
  if (!/^v[1-9][0-9]*$/.test(version)) throw new Error("Invalid payment PII key version");
  return version;
}

function encryptionKey(version: string): Buffer | null {
  const versioned = readKey(`PAYMENT_PII_ENCRYPTION_KEY_${version.toUpperCase()}`);
  if (versioned) return versioned;
  // Backward compatibility for the original v1 envelope and environment name.
  return version === "v1" ? readKey("PAYMENT_PII_ENCRYPTION_KEY") : null;
}

export function paymentPiiConfigured(): boolean {
  try { return !!encryptionKey(activePaymentPiiVersion()) && !!readKey("PAYMENT_PII_FINGERPRINT_KEY"); }
  catch { return false; }
}

/** AES-256-GCM envelope. Key version is explicit so ciphertext can be rotated without storing plaintext. */
export function encryptPaymentPhone(phone: string): string {
  const version = activePaymentPiiVersion();
  const key = encryptionKey(version);
  if (!key) throw new Error(`Payment PII encryption key ${version} is not configured`);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(phone, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${version}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptPaymentPhone(envelope: string): string {
  const [version, ivPart, tagPart, cipherPart] = envelope.split(":");
  const key = encryptionKey(version || "");
  if (!key) throw new Error(`Payment PII decryption key ${version || "unknown"} is not configured`);
  if (!/^v[1-9][0-9]*$/.test(version) || !ivPart || !tagPart || !cipherPart) throw new Error("Unsupported payment PII envelope version");
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Malformed payment PII envelope");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(cipherPart, "base64url")), decipher.final()]).toString("utf8");
}

/** Fingerprint key is intentionally independent and stable; rotating it requires a separate full re-index operation. */
export function fingerprintPaymentPhone(phone: string): string {
  const key = readKey("PAYMENT_PII_FINGERPRINT_KEY");
  if (!key) throw new Error("Payment PII fingerprinting is not configured");
  return createHmac("sha256", key).update(phone).digest("hex");
}
