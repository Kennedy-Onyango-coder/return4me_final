import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const agents=readFileSync(new URL('../server/routes/agents.ts',import.meta.url),'utf8');
const organisations=readFileSync(new URL('../server/routes/organisations.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');

test('agent queue is metadata-only and detail read is separately audited',()=>{
  const queue=agents.split('agentsRouter.get("/admin"')[1]?.split('agentsRouter.get("/:id/admin-detail"')[0]??'';
  assert.ok(queue.length>0); assert.doesNotMatch(queue,/serviceAddress|servicePhone|capacityNotes|email:/);
  assert.match(agents,/agentsRouter\.get\("\/:id\/admin-detail",\s*requireRole\("admin",\s*"owner"\)/);
  assert.match(agents,/action: "admin\.agent_detail_viewed"/);
});

test('organisation queue omits registration identifiers and detail read is audited',()=>{
  const queue=organisations.split('organisationsRouter.get("/admin"')[1]?.split('organisationsRouter.get("/:organisationId/admin-detail"')[0]??'';
  assert.ok(queue.length>0); assert.doesNotMatch(queue,/registrationNumber/);
  assert.match(organisations,/organisationsRouter\.get\("\/:organisationId\/admin-detail",\s*requireRole\("admin",\s*"owner"\)/);
  assert.match(organisations,/action: "admin\.organisation_detail_viewed"/);
});

test('restricted Admin record workspace loads metadata queues and opens detail on selection',()=>{
  assert.match(ui,/<AgentOrganisationGovernance\/>/);
  const component=ui.split('function AgentOrganisationGovernance()')[1]?.split('function AdminCapabilityMatrix()')[0]??'';
  assert.ok(component.length>0); assert.match(component,/\/agents\/\'\+id\+'\/admin-detail/); assert.match(component,/\/organisations\/\'\+id\+'\/admin-detail/);
});

test('existing Admin operations use the new metadata-only Agent queue contract',()=>{
  assert.match(ui,/type AdminAgent = \{id:string;businessName:string;county:string;status:string;verifiedAt:string\|null;createdAt:string\}/);
  assert.match(ui,/const activeAgents=agents\.filter\(row=>row\.status===\"active\"\)/);
});
