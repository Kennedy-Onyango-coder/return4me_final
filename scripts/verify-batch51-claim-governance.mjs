import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const admin = read('../server/routes/admin.ts');
const claims = read('../server/routes/claims.ts');
const app = read('../src/App.tsx');
const checks = [
  ['metadata-only claim queue remains available to Admin and Owner', /adminRouter\.get\("\/claims", requireRole\("admin", "owner"\)/.test(admin)],
  ['claim detail route requires Admin or Owner', /adminRouter\.get\("\/claims\/:claimId", requireRole\("admin", "owner"\)/.test(admin)],
  ['claim detail access is audited', /admin\.claim_detail_viewed/.test(admin)],
  ['claim detail returns evidence metadata without storage keys', /documentId: documents\.id/.test(admin) && !/storageKey: documents\.storageKey/.test(admin)],
  ['legacy full-row Admin claim endpoint is removed', !/claimsRouter\.get\("\/admin"/.test(claims)],
  ['Admin UI loads metadata queue', /\/admin\/claims\?status=submitted/.test(app)],
  ['Admin UI opens restricted claim details', /\/admin\/claims\/\$\{claim\.id\}/.test(app)],
  ['claimant cannot review own authority', /claim\.claimantId === req\.auth!\.id/.test(claims)],
  ['claimant cannot review own ownership claim', /existing\.claimantId === req\.auth!\.id/.test(claims)],
  ['authority reviewer cannot approve same represented claim', /existing\.authorityVerifiedBy === req\.auth!\.id/.test(claims)],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
