import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../server/routes/admin.ts', import.meta.url), 'utf8');
const support = readFileSync(new URL('../server/routes/support.ts', import.meta.url), 'utf8');
const disputes = readFileSync(new URL('../server/routes/disputes.ts', import.meta.url), 'utf8');
const privacy = readFileSync(new URL('../server/routes/privacy.ts', import.meta.url), 'utf8');
const security = readFileSync(new URL('../server/routes/security-incidents.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../server/services/notification-worker.ts', import.meta.url), 'utf8');

const required = [
  'claimsAwaitingReview', 'openDisputes', 'appealsAwaitingReview', 'supportTicketsOpen',
  'dataRightsRequestsOpen', 'securityIncidentsOpen', 'notificationFailures',
  'organisationsAwaitingVerification', 'financials: { state: "not_enabled"'
];
for (const token of required) {
  if (!route.includes(token)) throw new Error(`Admin overview is missing required indicator or safety disclosure: ${token}`);
}
const statusContracts = [
  [route, 'caseDisputes.status', ['open', 'investigating', 'awaiting_information']],
  [route, 'supportTickets.status', ['open', 'in_progress', 'waiting_user']],
  [route, 'dataRightsRequests.status', ['received', 'under_review']],
  [route, 'securityIncidents.status', ['open', 'investigating', 'contained']],
  [route, 'notificationOutbox.status', ['retry', 'dead']]
];
for (const [source, field, statuses] of statusContracts) {
  const line = source.split('\n').find((entry) => entry.includes(field));
  if (!line || !statuses.every((status) => line.includes(`"${status}"`))) {
    throw new Error(`Admin overview status filter does not match the expected workflow for ${field}`);
  }
}
if (!support.includes('z.enum(["open", "in_progress", "waiting_user", "resolved", "closed"])')) throw new Error('Support status contract changed; review admin overview filter');
if (!disputes.includes('const activeDisputeStatuses = ["open", "investigating", "awaiting_information"]')) throw new Error('Dispute status contract changed; review admin overview filter');
if (!privacy.includes('z.enum(["under_review", "fulfilled", "declined"])')) throw new Error('Data-rights status contract changed; review admin overview filter');
if (!security.includes('z.enum(["open", "investigating", "contained", "resolved", "closed"])')) throw new Error('Security incident status contract changed; review admin overview filter');
if (!worker.includes("status=CASE WHEN attempt_count+1>=8 THEN 'dead' ELSE 'retry' END")) throw new Error('Notification worker status contract changed; review admin overview filter');
console.log('Admin overview guard passed: operational indicators are present and queue status filters match workflow contracts. Static guard only; not a database/API acceptance test.');
