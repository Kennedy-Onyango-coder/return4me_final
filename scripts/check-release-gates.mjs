const requiredTrue = [
  "MIGRATIONS_ACCEPTED",
  "BACKUP_RESTORE_VERIFIED",
  "RPO_RTO_APPROVED",
  "SECURITY_REVIEW_SIGNED_OFF",
  "PRIVACY_REVIEW_SIGNED_OFF",
  "ACCESSIBILITY_REVIEW_SIGNED_OFF",
  "PAYMENT_ACCOUNTING_REVIEW_SIGNED_OFF",
  "KENYA_LEGAL_REVIEW_SIGNED_OFF",
  "PILOT_APPROVED",
  "SOURCE_BASELINE_HASH_VERIFIED",
  "REQUIREMENT_RECONCILIATION_SIGNED_OFF",
  "CHANGE_CONTROL_APPROVED",
  "INDEPENDENT_ACCEPTANCE_COMPLETE",
  "OWNER_RELEASE_APPROVAL"
];
const blockers = [];
if (process.env.NODE_ENV !== "production") blockers.push("NODE_ENV must be production for a production release check");
for (const name of requiredTrue) if (process.env[name] !== "true") blockers.push(`${name} is not approved`);
for (const name of ["INTASEND_COLLECTION_ENABLED", "INTASEND_REFUND_ENABLED", "INTASEND_PAYOUT_ENABLED", "COMMUNICATIONS_PUBLISH_ENABLED", "EMAIL_NOTIFICATIONS_ENABLED", "SMS_NOTIFICATIONS_ENABLED"]) {
  if (process.env[name] === "true") blockers.push(`${name} is enabled but this release gate does not authorise external/live execution`);
}
for (const name of ["DATABASE_URL", "WEB_ORIGIN", "PUBLIC_APP_URL", "SESSION_HASH_SECRET", "OTP_HASH_SECRET", "CASE_TOKEN_HASH_SECRET", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_FROM", "CLAMAV_HOST", "S3_BUCKET", "S3_REGION", "PAYMENT_PII_FINGERPRINT_KEY"]) {
  if (!process.env[name]?.trim()) blockers.push(`${name} is missing`);
}
if ((process.env.SESSION_HASH_SECRET?.length ?? 0) < 32) blockers.push("SESSION_HASH_SECRET must be at least 32 characters");
if ((process.env.OTP_HASH_SECRET?.length ?? 0) < 32) blockers.push("OTP_HASH_SECRET must be at least 32 characters");
if ((process.env.CASE_TOKEN_HASH_SECRET?.length ?? 0) < 32) blockers.push("CASE_TOKEN_HASH_SECRET must be at least 32 characters");
if (process.env.RESEND_WEBHOOK_SECRET && !/^whsec_[A-Za-z0-9+/=_-]{16,}$/.test(process.env.RESEND_WEBHOOK_SECRET)) blockers.push("RESEND_WEBHOOK_SECRET must be a valid Resend/Svix whsec_ secret");
for (const pair of [["SESSION_HASH_SECRET","OTP_HASH_SECRET"],["SESSION_HASH_SECRET","CASE_TOKEN_HASH_SECRET"],["OTP_HASH_SECRET","CASE_TOKEN_HASH_SECRET"]]) {
  if (process.env[pair[0]] && process.env[pair[1]] && process.env[pair[0]] === process.env[pair[1]]) blockers.push(`${pair[0]} and ${pair[1]} must be independent`);
}
for (const name of ["WEB_ORIGIN", "PUBLIC_APP_URL"]) if (process.env[name] && !process.env[name].startsWith("https://")) blockers.push(`${name} must use HTTPS`);
if (process.env.INTASEND_ENVIRONMENT === "live") blockers.push("INTASEND_ENVIRONMENT=live is not supported by this replacement source");
if (!/^[a-fA-F0-9]{64}$/.test(process.env.PAYMENT_PII_FINGERPRINT_KEY ?? "")) blockers.push("PAYMENT_PII_FINGERPRINT_KEY must be a 32-byte hex key");
if (process.env.PAYMENT_PII_ACTIVE_KEY_VERSION) {
  const keyName = `PAYMENT_PII_ENCRYPTION_KEY_${process.env.PAYMENT_PII_ACTIVE_KEY_VERSION.toUpperCase()}`;
  if (!/^[a-fA-F0-9]{64}$/.test(process.env[keyName] ?? "")) blockers.push(`${keyName} must be a 32-byte hex key`);
} else blockers.push("PAYMENT_PII_ACTIVE_KEY_VERSION is missing");
if (blockers.length) {
  process.stderr.write(`Release blocked (${blockers.length} outstanding gates):\n${blockers.map(item => `- ${item}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("Release gate configuration passed. This is not production deployment authorisation.\n");
