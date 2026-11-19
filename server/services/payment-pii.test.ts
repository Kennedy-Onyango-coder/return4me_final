import { afterEach, describe, expect, it } from "vitest";
import { activePaymentPiiVersion, decryptPaymentPhone, encryptPaymentPhone, fingerprintPaymentPhone, paymentPiiConfigured } from "./payment-pii.js";

const names = ["PAYMENT_PII_ENCRYPTION_KEY","PAYMENT_PII_ENCRYPTION_KEY_V1","PAYMENT_PII_ENCRYPTION_KEY_V2","PAYMENT_PII_FINGERPRINT_KEY","PAYMENT_PII_ACTIVE_KEY_VERSION"] as const;
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
afterEach(() => { for (const name of names) { const value = original[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

describe("payment PII protection", () => {
  it("keeps legacy v1 envelopes decryptable and fingerprints deterministic", () => {
    process.env.PAYMENT_PII_ACTIVE_KEY_VERSION = "v1";
    process.env.PAYMENT_PII_ENCRYPTION_KEY = "11".repeat(32);
    process.env.PAYMENT_PII_FINGERPRINT_KEY = "22".repeat(32);
    const phone = "+254712345678";
    const encrypted = encryptPaymentPhone(phone);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(encrypted).not.toContain(phone);
    expect(decryptPaymentPhone(encrypted)).toBe(phone);
    expect(fingerprintPaymentPhone(phone)).toBe(fingerprintPaymentPhone(phone));
    expect(paymentPiiConfigured()).toBe(true);
  });
  it("supports v2 writes while retaining v1 decrypt capability during rotation", () => {
    process.env.PAYMENT_PII_ACTIVE_KEY_VERSION = "v1";
    process.env.PAYMENT_PII_ENCRYPTION_KEY_V1 = "11".repeat(32);
    process.env.PAYMENT_PII_ENCRYPTION_KEY_V2 = "33".repeat(32);
    process.env.PAYMENT_PII_FINGERPRINT_KEY = "22".repeat(32);
    const phone = "+254712345678";
    const legacy = encryptPaymentPhone(phone);
    process.env.PAYMENT_PII_ACTIVE_KEY_VERSION = "v2";
    expect(activePaymentPiiVersion()).toBe("v2");
    const rotated = encryptPaymentPhone(decryptPaymentPhone(legacy));
    expect(rotated.startsWith("v2:")).toBe(true);
    expect(decryptPaymentPhone(rotated)).toBe(phone);
    expect(decryptPaymentPhone(legacy)).toBe(phone);
    expect(fingerprintPaymentPhone(phone)).toBe(fingerprintPaymentPhone(phone));
    expect(paymentPiiConfigured()).toBe(true);
  });
  it("refuses to encrypt or fingerprint when keys are absent or malformed", () => {
    for (const name of names) delete process.env[name];
    expect(paymentPiiConfigured()).toBe(false);
    expect(() => encryptPaymentPhone("+254712345678")).toThrow();
    expect(() => fingerprintPaymentPhone("+254712345678")).toThrow();
  });
  it("rejects malformed and unsupported envelopes", () => {
    process.env.PAYMENT_PII_ENCRYPTION_KEY_V1 = "11".repeat(32);
    expect(() => decryptPaymentPhone("v9:bad:bad:bad")).toThrow();
    expect(() => decryptPaymentPhone("v1:short:short:short")).toThrow();
  });
});
