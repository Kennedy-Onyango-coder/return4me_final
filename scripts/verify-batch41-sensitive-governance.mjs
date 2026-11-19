import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const privacy = await read("server/routes/privacy.ts");
const incidents = await read("server/routes/security-incidents.ts");
const auth = await read("server/routes/auth.ts");
const purposes = await read("shared/admin-step-up-policy.mjs");
const ui = await read("src/App.tsx");
const adminRoles = await read("shared/admin-role-policy.mjs");
const security = await read("server/security.ts");

for (const purpose of ["admin.privacy.request.decide", "admin.security_incident.update"]) {
  assert.ok(auth.includes(`\"${purpose}\"`), `OTP mapping missing ${purpose}`);
  assert.ok(purposes.includes(`\"${purpose}\"`), `allowlist missing ${purpose}`);
  assert.ok(ui.includes(`value=\"${purpose}\"`), `Admin workspace option missing ${purpose}`);
}
assert.match(privacy, /privacyRouter\.use\(authenticate\)/);
assert.match(privacy, /privacyRouter\.post\(\"\/requests\/:id\/decision\", requireRole\(\"admin\"\), \(req, res, next\) => requireStepUpInTransaction\(\"admin\.privacy\.request\.decide\"\)/);
assert.match(privacy, /where\(eq\(dataRightsRequests\.id, req\.params\.id\)\)\.limit\(1\)\.for\(\"update\"\)/);
assert.match(privacy, /consumeStepUpGrantInTransaction\(tx, req\.auth!, \"admin\.privacy\.request\.decide\"\)/);
assert.match(privacy, /tx\.insert\(auditEvents\)[\s\S]*privacy\.data_rights_request_decided/);

assert.match(incidents, /securityIncidentsRouter\.use\(authenticate\)/);
assert.match(incidents, /securityIncidentsRouter\.patch\(\"\/:incidentId\", requireRole\(\"trust_safety\", \"admin\"\), \(req, res, next\) => requireStepUpInTransaction\(\"admin\.security_incident\.update\"\)/);
assert.match(incidents, /where\(eq\(securityIncidents\.id, req\.params\.incidentId\)\)\.limit\(1\)\.for\(\"update\"\)/);
assert.match(incidents, /consumeStepUpGrantInTransaction\(tx, req\.auth!, \"admin\.security_incident\.update\"\)/);
assert.match(incidents, /tx\.insert\(auditEvents\)[\s\S]*security\.incident_updated/);

assert.match(privacy, /where\(eq\(dataRightsRequests\.userId, req\.auth!\.id\)\)/);
assert.match(incidents, /where\(eq\(securityIncidents\.reportedBy, req\.auth!\.id\)\)/);
assert.match(adminRoles, /legacyAdminScopes/);
assert.match(security, /normalizePrivilegedRoles\(roles\.map\(row => row\.role\)\)/);
console.log("Batch 41 guard passed: step-up protected privacy/security decisions, row locking, transaction-bound grant consumption, audit coupling and self-scoped personal records. Static source check only.");
