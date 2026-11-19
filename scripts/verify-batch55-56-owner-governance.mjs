import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const routeDir = path.join(root, 'server/routes');
const mountByRouter = {
  adminRouter: '/api/admin', agentsRouter: '/api/agents', agentOperationsRouter: '/api/agent-operations',
  agentDocumentsRouter: '/api/agent-documents', claimsRouter: '/api/claims', claimEvidenceRouter: '/api',
  disputesRouter: '/api/disputes', securityIncidentsRouter: '/api/security-incidents', supportRouter: '/api/support',
  pricingRouter: '/api/pricing', financeRouter: '/api/finance', communicationsRouter: '/api/communications',
  organisationsRouter: '/api/organisations', privacyRouter: '/api/privacy', matchingRouter: '/api/matching'
};
const privilegedRoles = new Set(['admin', 'owner', 'finance', 'trust_safety', 'support', 'communications_writer', 'communications_approver', 'communications_publisher']);
const files = fs.readdirSync(routeDir).filter(name => name.endsWith('.ts')).sort();
const rows = [];
const issues = [];

for (const file of files) {
  const source = fs.readFileSync(path.join(routeDir, file), 'utf8');
  const routerNames = [...source.matchAll(/export\s+const\s+(\w+Router)\s*=\s*Router\(\)/g)].map(match => match[1]);
  const globalByRouter = new Map();
  for (const router of routerNames) {
    const usePattern = new RegExp(`${router}\\.use\\(([^;\\n]+)\\)`, 'g');
    const uses = [...source.matchAll(usePattern)].map(match => match[1]);
    const globalText = uses.join(' ');
    const roles = [...globalText.matchAll(/requireRole\(([^)]*)\)/g)].flatMap(match => [...match[1].matchAll(/["']([^"']+)["']/g)].map(role => role[1]));
    globalByRouter.set(router, { authenticated: /\bauthenticate\b/.test(globalText), roles });
  }

  const routePattern = /(\w+Router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)['"]/g;
  for (const match of source.matchAll(routePattern)) {
    const [, router, method, routePath] = match;
    const tail = source.slice(match.index + match[0].length, match.index + match[0].length + 1600);
    const beforeHandler = tail.split(/=>/, 1)[0];
    const localRoles = [...beforeHandler.matchAll(/requireRole\(([^)]*)\)/g)].flatMap(item => [...item[1].matchAll(/["']([^"']+)["']/g)].map(role => role[1]));
    const global = globalByRouter.get(router) || { authenticated: false, roles: [] };
    const roles = [...new Set([...global.roles, ...localRoles])];
    const isPrivileged = roles.some(role => privilegedRoles.has(role)) || /(^|\/)admin(?:\/|$)/.test(routePath);
    if (!isPrivileged) continue;

    const authenticated = global.authenticated || /\bauthenticate\b/.test(beforeHandler);
    const roleGuard = roles.length > 0;
    const stepUp = /requireStepUp(?:InTransaction)?\(/.test(beforeHandler);
    const actionClass = ['GET'].includes(method.toUpperCase()) ? 'read' : 'consequential_write';
    const lower = `${file} ${routePath}`.toLowerCase();
    const dataClass = /finance|payout|refund|settlement|ledger|payment/.test(lower) ? 'financial_restricted'
      : /evidence|document|privacy|claim|appeal|dispute/.test(lower) ? 'restricted_case_or_identity'
      : /security|incident|audit/.test(lower) ? 'restricted_security_or_audit'
      : /support/.test(lower) ? 'customer_support'
      : /agent|organisation|assignment/.test(lower) ? 'operational_personal'
      : 'administrative_metadata';
    const sourceLine = source.slice(0, match.index).split('\n').length;
    const base = mountByRouter[router] || 'MOUNT_REVIEW_REQUIRED';
    const fullPath = `${base}${routePath === '/' ? '' : routePath}`;
    const auditSignal = /auditEvents|auditEvent|audit\w*\(/i.test(tail.slice(0, 5000));
    const row = {
      file, line: sourceLine, method: method.toUpperCase(), router, path: fullPath,
      role_gate: roles.join('|') || 'MISSING', authentication: authenticated ? 'router_or_route_authenticate' : 'MISSING',
      action_class: actionClass, step_up_source: stepUp ? 'present_in_route_middleware' : 'not_detected_in_route_middleware',
      data_class: dataClass, audit_source_signal: auditSignal ? 'audit_reference_near_handler' : 'not_detected_near_handler',
      object_scope: 'API/DB negative tests pending', field_scope: 'projection review and response tests pending',
      tenant_scope: 'tenant/organisation isolation tests pending', runtime_acceptance: 'NOT_RUN'
    };
    rows.push(row);
    if (!authenticated) issues.push(`${file}:${sourceLine} ${method.toUpperCase()} ${routePath}: no router/route authenticate middleware detected`);
    if (!roleGuard) issues.push(`${file}:${sourceLine} ${method.toUpperCase()} ${routePath}: no role gate detected`);
  }
}

const header = ['file','line','method','router','path','role_gate','authentication','action_class','step_up_source','data_class','audit_source_signal','object_scope','field_scope','tenant_scope','runtime_acceptance'];
const escape = value => `"${String(value).replaceAll('"', '""')}"`;
const csv = [header.join(','), ...rows.map(row => header.map(key => escape(row[key])).join(','))].join('\n') + '\n';
const output = path.join(root, 'docs/ADMIN_OWNER_PERMISSION_MATRIX_BATCH55.csv');
fs.writeFileSync(output, csv);

const adminRouterRoutes = rows.filter(row => row.router === 'adminRouter');
const ownerSnapshot = fs.readFileSync(path.join(root, 'server/routes/admin.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'shared/admin-access-policy.mjs'), 'utf8');
const checks = [
  ['privileged route inventory is non-empty', rows.length > 0],
  ['all discovered privileged routes have authentication', rows.every(row => row.authentication !== 'MISSING')],
  ['all discovered privileged routes have role gates', rows.every(row => row.role_gate !== 'MISSING')],
  ['all Admin router routes are role-gated', adminRouterRoutes.length > 0 && adminRouterRoutes.every(row => row.role_gate !== 'MISSING')],
  ['Owner oversight endpoint is Owner-only', /get\("\/owner-oversight",\s*requireRole\("owner"\)/.test(ownerSnapshot)],
  ['Owner oversight response is aggregate-only', /pendingAdminProposals:|activeAdminRoleGrants:|auditEventsLast24Hours:/.test(ownerSnapshot) && !/res\.json\(\{\s*oversight:\s*\{[^}]*email|res\.json\(\{\s*oversight:\s*\{[^}]*claimant/i.test(ownerSnapshot)],
  ['Owner oversight access is audited', /owner\.oversight_snapshot_viewed/.test(ownerSnapshot)],
  ['Owner-only panel is conditionally mounted', /user\.roles\.includes\("owner"\)&&<OwnerOversightPanel\/>/.test(ui)],
  ['capability catalogue includes cross-domain governance domains', ['privacy.requests','security.incidents','agent.documents','agent.operations','pricing.governance','support.manage','finance.oversight'].every(value => policy.includes(value))]
];
for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
console.log(`INVENTORY ${rows.length} privileged route declarations across ${files.length} route files`);
console.log(`ADMIN ROUTER ${adminRouterRoutes.length} declarations`);
console.log(`MATRIX ${path.relative(root, output)}`);
for (const issue of issues) console.log(`ISSUE ${issue}`);
if (checks.some(([, passed]) => !passed) || issues.length) process.exitCode = 1;
