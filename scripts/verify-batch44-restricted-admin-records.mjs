import { readFileSync } from 'node:fs';
const agents = readFileSync(new URL('../server/routes/agents.ts', import.meta.url), 'utf8');
const organisations = readFileSync(new URL('../server/routes/organisations.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const checks = [
  ['agent admin queue is Admin/Owner protected', /agentsRouter\.get\("\/admin",\s*requireRole\("admin",\s*"owner"\)/.test(agents)],
  ['agent queue omits contact and application detail', (() => { const q=agents.split('agentsRouter.get("/admin"')[1]?.split('agentsRouter.get("/:id/admin-detail"')[0]??''; return q.length>0 && !/serviceAddress|servicePhone|capacityNotes|email:/.test(q); })()],
  ['agent detail is separately protected', /agentsRouter\.get\("\/:id\/admin-detail",\s*requireRole\("admin",\s*"owner"\)/.test(agents)],
  ['agent detail read is audited', /action: "admin\.agent_detail_viewed"/.test(agents)],
  ['organisation admin queue is Admin/Owner protected', /organisationsRouter\.get\("\/admin",\s*requireRole\("admin",\s*"owner"\)/.test(organisations)],
  ['organisation queue omits registration number', (() => { const q=organisations.split('organisationsRouter.get("/admin"')[1]?.split('organisationsRouter.get("/:organisationId/admin-detail"')[0]??''; return q.length>0 && !/registrationNumber/.test(q); })()],
  ['organisation detail is separately protected', /organisationsRouter\.get\("\/:organisationId\/admin-detail",\s*requireRole\("admin",\s*"owner"\)/.test(organisations)],
  ['organisation detail read is audited', /action: "admin\.organisation_detail_viewed"/.test(organisations)],
  ['restricted Admin record workspace is mounted', /<AgentOrganisationGovernance\/>/.test(ui)],
  ['workspace fetches restricted details only on selection', /function AgentOrganisationGovernance\(\)[\s\S]*?\/agents\/\'\+id\+'\/admin-detail[\s\S]*?\/organisations\/\'\+id\+'\/admin-detail/.test(ui)],
  ['legacy Admin operations consume the metadata-only Agent DTO', /type AdminAgent = \{id:string;businessName:string;county:string;status:string;verifiedAt:string\|null;createdAt:string\}/.test(ui) && /const activeAgents=agents\.filter\(row=>row\.status==="active"\)/.test(ui)],
  ['no new privileged role introduced', !/requireRole\([^)]*"finance_admin"|requireRole\([^)]*"agent_admin"/.test(agents+organisations)]
];
let failed=0;
for (const [name,pass] of checks) { console.log(`${pass?'PASS':'FAIL'} ${name}`); if(!pass) failed++; }
if(failed) process.exitCode=1; else console.log(`Batch 44 restricted Admin record guard passed (${checks.length} checks). Static source guard only.`);
