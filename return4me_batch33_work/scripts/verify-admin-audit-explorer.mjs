import { readFileSync } from 'node:fs';
const route = readFileSync(new URL('../server/routes/admin.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../server/db/schema.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../server/db/migrations/0011_audit_created_index.sql', import.meta.url), 'utf8');
const parser = readFileSync(new URL('../shared/audit-query.mjs', import.meta.url), 'utf8');
const parserTests = readFileSync(new URL('./test-audit-query.mjs', import.meta.url), 'utf8');
const checks = [
  ['admin/owner-only authorization', 'adminRouter.get("/audit-events", requireRole("admin", "owner")'],
  ['bounded pagination parser', 'rawLimit > 100'],
  ['offset ceiling parser', 'rawOffset > 100000'],
  ['action filter', 'eq(auditEvents.action, action)'],
  ['resource filter', 'eq(auditEvents.resourceType, resourceType)'],
  ['outcome filter', 'eq(auditEvents.outcome, outcome)'],
  ['date lower bound', 'gte(auditEvents.createdAt, from)'],
  ['date upper bound', 'lte(auditEvents.createdAt, to)'],
  ['paired date bounds', 'Boolean(from) !== Boolean(to)'],
  ['maximum date range', '90 * 24 * 60 * 60 * 1000'],
  ['reject unknown query keys', 'Unsupported audit filter'],
  ['reject repeated query values', 'must be supplied exactly once'],
  ['allowlisted outcomes', 'Outcome must be success, failure, or denied'],
  ['metadata excluded from projection', 'resourceId: auditEvents.resourceId'],
  ['read-only audit workspace', 'function AdminAuditExplorer()'],
  ['workspace role gate', 'role==="admin"||role==="owner"'],
  ['paged loading', 'Load older events'],
  ['action filter UI', 'Apply filters'],
  ['date filter UI', 'type=\"date\"'],
  ['clear filter action', 'async function clearFilters()']
];
for (const [label, token] of checks) {
  const source = label.includes('workspace') || label.includes('paged') || label.includes('role gate') || label.endsWith('UI') || label.includes('clear filter') ? ui : route;
  if (label.includes('pagination') || label.includes('ceiling') || label.includes('paired date') || label.includes('maximum date') || label.includes('unknown query') || label.includes('repeated query') || label.includes('allowlisted outcomes')) {
    if (!parser.includes(token)) throw new Error(`Admin audit explorer guard failed: ${label}`);
  } else if (!source.includes(token)) throw new Error(`Admin audit explorer guard failed: ${label}`);
}
const projection = route.match(/db\.select\(\{ id: auditEvents\.id([\s\S]*?)\}\)\s*\.from\(auditEvents\)/);
if (!projection || /metadata:\s*auditEvents\.metadata/.test(projection[1])) throw new Error('Audit endpoint must not return event metadata.');
if (!schema.includes('index(\"audit_created_idx\").on(t.createdAt)') || !migration.includes('CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at)')) throw new Error('Audit chronology index is missing from schema or migration.');
if (!parserTests.includes('date range over 90 days') || !parserTests.includes('negative offset')) throw new Error('Audit query boundary tests are missing.');
console.log('Admin audit explorer guard passed: API filters, extracted query validation, executable boundary tests, UI controls and chronology index are present. Static guard only; database/API authorization and browser acceptance remain required.');
