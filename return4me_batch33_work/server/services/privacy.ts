/**
 * Conservative disclosure checks for content intended for public channels.
 * This is a pre-screen only. Administrator review and reporter consent are still required.
 */
const publicDisclosurePatterns: Array<[string, RegExp]> = [
  ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["Kenyan phone number", /(?:\+254|0)(?:7|1)\d{8}\b/],
  ["labelled identity or account number", /\b(?:national\s+id|identity\s+number|passport\s+(?:number|no\.?)|id\s+(?:number|no\.?)|account\s+(?:number|no\.?))\s*[:#-]?\s*[A-Z0-9-]{5,}\b/i],
  ["IMEI or serial identifier", /\b(?:imei|serial(?:\s+number)?)\s*[:#-]?\s*[A-Z0-9-]{6,}\b/i],
  ["one-time or pickup code", /\b(?:otp|verification\s+code|pickup\s+code|drop-?off\s+code)\s*[:#-]?\s*\d{4,8}\b/i],
  ["private case reference", /\b(?:R4M|CLM|PAY|SUP)-[A-Z0-9-]{4,}\b/i],
];

export function publicDisclosureIssue(value: string): string | null {
  return publicDisclosurePatterns.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

export function isPublicDisclosureSafe(value: string): boolean {
  return publicDisclosureIssue(value) === null;
}
