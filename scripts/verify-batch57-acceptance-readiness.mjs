import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const migration = fs.readFileSync(path.join(root, 'server/db/migrations/0017_admin_audit_immutability.sql'), 'utf8');
const integration = fs.readFileSync(path.join(root, 'scripts/integration/test-admin-governance-postgres.mjs'), 'utf8');
const matrix = fs.readFileSync(path.join(root, 'docs/ADMIN_OWNER_PERMISSION_MATRIX_BATCH55.csv'), 'utf8');
const checks = [
  ['audit immutability migration covers UPDATE, DELETE and TRUNCATE', /BEFORE UPDATE ON audit_events/.test(migration) && /BEFORE DELETE ON audit_events/.test(migration) && /BEFORE TRUNCATE ON audit_events/.test(migration)],
  ['PostgreSQL acceptance harness applies the repository migration', /0017_admin_audit_immutability\.sql/.test(integration) && /await client\.query\(migration\)/.test(integration)],
  ['PostgreSQL harness asserts SQLSTATE 55000 for UPDATE, DELETE and TRUNCATE', (integration.match(/error\.code === '55000'/g) || []).length === 3],
  ['PostgreSQL harness verifies permitted append operations', /audit inserts remain permitted/.test(integration)],
  ['permission matrix retains object, field and tenant runtime gaps', /API\/DB negative tests pending/.test(matrix) && /tenant\/organisation isolation tests pending/.test(matrix)],
  ['permission matrix explicitly records runtime acceptance as not run', /NOT_RUN/.test(matrix)]
];
for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
console.log(`Batch 57 acceptance readiness: ${checks.filter(([, passed]) => passed).length}/${checks.length}`);
if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
