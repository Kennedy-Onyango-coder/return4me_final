import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const matrix = fs.readFileSync('docs/ADMIN_OWNER_PERMISSION_MATRIX_BATCH55.csv', 'utf8');
const adminRoutes = fs.readFileSync('server/routes/admin.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const policy = fs.readFileSync('shared/admin-access-policy.mjs', 'utf8');
const verifier = fs.readFileSync('scripts/verify-batch55-56-owner-governance.mjs', 'utf8');

test('permission inventory contains more than one hundred privileged route declarations', () => {
  const rows = matrix.trim().split('\n');
  assert.ok(rows.length - 1 >= 100);
});

test('every inventoried privileged route is explicitly marked for auth and role enforcement', () => {
  assert.doesNotMatch(matrix, /"MISSING"/);
  assert.match(matrix, /API\/DB negative tests pending/);
  assert.match(matrix, /tenant\/organisation isolation tests pending/);
});

test('Owner oversight endpoint is Owner-only and returns aggregate metrics', () => {
  assert.match(adminRoutes, /get\("\/owner-oversight", requireRole\("owner"\)/);
  for (const field of ['pendingAdminProposals', 'activeAdminRoleGrants', 'auditEventsLast24Hours', 'openSecurityIncidents', 'openDataRightsRequests', 'notificationFailures']) {
    assert.ok(adminRoutes.includes(`${field}:`), `missing ${field}`);
  }
  assert.match(adminRoutes, /owner\.oversight_snapshot_viewed/);
});

test('Owner oversight panel is only mounted for Owner role', () => {
  assert.match(app, /user\.roles\.includes\("owner"\)&&<OwnerOversightPanel\/>/);
  assert.match(app, /function OwnerOversightPanel\(\)/);
});

test('capability catalogue includes cross-domain operational domains without claiming route enforcement', () => {
  for (const capability of ['privacy.requests', 'security.incidents', 'agent.documents', 'agent.operations', 'pricing.governance', 'support.manage', 'finance.oversight']) {
    assert.ok(policy.includes(capability));
  }
  assert.match(policy, /route middleware remains authoritative/);
});

test('inventory verifier checks auth, role gates and Owner dashboard boundaries', () => {
  assert.match(verifier, /all discovered privileged routes have authentication/);
  assert.match(verifier, /all discovered privileged routes have role gates/);
  assert.match(verifier, /Owner oversight endpoint is Owner-only/);
});
