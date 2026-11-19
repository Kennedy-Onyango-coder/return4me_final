import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const admin = source('../server/routes/admin.ts');
const claims = source('../server/routes/claims.ts');
const app = source('../src/App.tsx');
test('Admin claim queue exposes only explicit metadata projection', () => {
  const start = admin.indexOf('adminRouter.get("/claims"');
  const end = admin.indexOf('adminRouter.get("/claims/:claimId"', start);
  assert.ok(start >= 0 && end > start);
  const route = admin.slice(start, end);
  assert.match(route, /claims\.id/);
  assert.doesNotMatch(route, /claimantId|ownershipEvidenceSummary|representedPersonName|authorityDeclaration/);
});
test('restricted claim detail is role-gated and audited', () => {
  assert.match(admin, /adminRouter\.get\("\/claims\/:claimId", requireRole\("admin", "owner"\)/);
  assert.match(admin, /admin\.claim_detail_viewed/);
});
test('legacy full-row Admin endpoint is absent', () => assert.doesNotMatch(claims, /claimsRouter\.get\("\/admin"/));
test('self-review and same-reviewer approval are blocked', () => {
  assert.match(claims, /claim\.claimantId === req\.auth!\.id/);
  assert.match(claims, /existing\.claimantId === req\.auth!\.id/);
  assert.match(claims, /existing\.authorityVerifiedBy === req\.auth!\.id/);
});
test('Admin UI uses metadata queue and separately loads detail', () => {
  assert.match(app, /\/admin\/claims\?status=submitted/);
  assert.match(app, /\/admin\/claims\/\$\{claim\.id\}/);
});
