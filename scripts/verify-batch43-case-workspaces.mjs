import { readFileSync } from 'node:fs';
const admin = readFileSync(new URL('../server/routes/admin.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const workspace = ui.split('function CaseDetailWorkspaces()')[1]?.split('function AdminCapabilityMatrix()')[0] ?? ''; 
const checks = [
  ['dispute detail endpoint is Admin/Owner protected', /get\("\/disputes\/:disputeId",\s*requireRole\("admin",\s*"owner"\)/.test(admin)],
  ['appeal detail endpoint is Admin/Owner protected', /get\("\/appeals\/:appealId",\s*requireRole\("admin",\s*"owner"\)/.test(admin)],
  ['dispute detail access is audited', /admin\.dispute_detail_viewed/.test(admin)],
  ['appeal detail access is audited', /admin\.appeal_detail_viewed/.test(admin)],
  ['appeal decisions require transaction-bound step-up', /requireStepUpInTransaction\(\"admin\.appeal\.review\"\)/.test(readFileSync(new URL('../server/routes/claims.ts', import.meta.url), 'utf8')) && /consumeStepUpGrantInTransaction\(tx, req\.auth!, \"admin\.appeal\.review\"\)/.test(readFileSync(new URL('../server/routes/claims.ts', import.meta.url), 'utf8'))],
  ['legacy appeal queue no longer returns appeal narratives', !/claimsRouter\.get\(\"\/appeals\/queue\"[\s\S]*?grounds: claimAppeals\.grounds/.test(readFileSync(new URL('../server/routes/claims.ts', import.meta.url), 'utf8'))],
  ['audit events do not include case narratives', /admin\.dispute_detail_viewed"[^\n]*metadata/.test(admin) === false && /admin\.appeal_detail_viewed"[^\n]*metadata/.test(admin) === false],
  ['dispute queue remains a metadata projection', /adminRouter\.get\("\/disputes"[\s\S]*?reasonCode: caseDisputes\.reasonCode[\s\S]*?createdAt: caseDisputes\.createdAt/.test(admin)],
  ['appeal queue exposes report reference without appeal grounds', /adminRouter\.get\("\/appeals"[\s\S]*?reportReference: reports\.reference[\s\S]*?createdAt: claimAppeals\.createdAt/.test(admin) && !/adminRouter\.get\("\/appeals"[\s\S]*?grounds: claimAppeals\.grounds/.test(admin)],
  ['case workspace is mounted for privileged roles', /<CaseDetailWorkspaces\/>/.test(ui)],
  ['case detail UI does not invoke a decision endpoint', ! /api(?:<[^>]+>)?\([^)]*\/(?:review|resolve)/.test(workspace)],
  ['no release or payout operation is wired into case workspace', ! /api(?:<[^>]+>)?\([^)]*\/(?:release|payout|settlement)/i.test(workspace)]
];
let failed = 0;
for (const [name, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); if (!pass) failed++; }
if (failed) process.exitCode = 1;
else console.log(`Batch 43 case workspace guard passed (${checks.length} checks). Static source guard only.`);
