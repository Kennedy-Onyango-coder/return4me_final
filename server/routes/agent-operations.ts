import { Router } from "express";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/index.js";
import { authenticate, requireRole, requireStepUpInTransaction, consumeStepUpGrantWithPgClient } from "../security.js";
import { sendClaimantCollectionCode } from "../services/email.js";

export const agentOperationsRouter = Router();
agentOperationsRouter.use(authenticate);
const pepper = process.env.CASE_TOKEN_HASH_SECRET || "development-case-token-pepper-change-before-deploy";
const codeHash = (code: string) => createHmac("sha256", pepper).update(code).digest("hex");
const modules = ["custody_basics", "privacy_safety", "handover_incidents"] as const;
const quizzes: Record<string, { question: string; options: string[]; answer: number }[]> = {
  custody_basics: [
    { question: "When may an Agent physically receive a found item?", options: ["Whenever a Finder asks", "Only under an active authorised assignment", "At a private location chosen by the Finder"], answer: 1 },
    { question: "What must be recorded when an item enters custody?", options: ["An attributable custody event", "Only a chat message", "Nothing if the item looks safe"], answer: 0 },
    { question: "Can a public match establish ownership?", options: ["Yes", "No; a human claim review is required", "Only if the photo matches"], answer: 1 },
    { question: "What should an Agent do if an item is not the one described in the assignment?", options: ["Accept it anyway", "Pause receipt and ask Admin for clarification", "Change the report description"], answer: 1 },
    { question: "Who may cancel or reassign an active case?", options: ["Any Finder", "The assigned Agent without a record", "An authorised Admin using the controlled workflow"], answer: 2 }
  ],
  privacy_safety: [
    { question: "How should claimant and Finder contact be coordinated?", options: ["Share personal phone numbers", "Use approved platform channels and verified Agent service contact", "Arrange a private meeting"], answer: 1 },
    { question: "Should identity documents be exposed in a public listing?", options: ["Yes", "Only partially", "No; keep them in private restricted storage"], answer: 2 },
    { question: "What should happen if a document scan is unavailable?", options: ["Accept it anyway", "Fail closed and request later resubmission", "Email it to other Agents"], answer: 1 },
    { question: "May an Agent disclose a claimant's private details to a Finder?", options: ["Yes, to speed things up", "Only if the Finder asks", "No; use approved coordination channels"], answer: 2 },
    { question: "How should a suspected data exposure be handled?", options: ["Ignore it", "Report it through the restricted incident process", "Post details in a public group"], answer: 1 }
  ],
  handover_incidents: [
    { question: "What is required before a claimant collection handover?", options: ["Claim approval, identity/authority checks and collection code", "A verbal promise", "A public match"], answer: 0 },
    { question: "What if a custody incident or dispute is raised?", options: ["Continue release", "Pause the affected workflow and escalate", "Delete the custody record"], answer: 1 },
    { question: "May a custody record be edited after submission?", options: ["Yes, by any Agent", "Only by the original Agent", "No; append a correcting event with an audit trail"], answer: 2 },
    { question: "What happens when a dispute is raised before collection?", options: ["Pause the affected release workflow", "Ignore the dispute", "Release the item immediately"], answer: 0 },
    { question: "What does a claimant collection code authorise?", options: ["An immediate release", "Identity/collection step only; payment and legal gates still apply", "A transfer to any person"], answer: 1 }
  ]
};

// Agent completes the system-assessed quiz; score is computed server-side and validity is 12 months.
agentOperationsRouter.get("/training/modules", requireRole("agent", "claimant", "finder"), (_req, res) => {
  res.json({ modules: modules.map(code => ({ code, questions: quizzes[code].map(({ question, options }, index) => ({ id: index, question, options })) })), passingScore: 80, validityMonths: 12 });
});
agentOperationsRouter.post("/training/:moduleCode/attempt", requireRole("agent", "claimant", "finder"), async (req, res, next) => {
  const moduleCode = req.params.moduleCode;
  const parsed = z.object({ answers: z.array(z.number().int().min(0).max(2)).length(5) }).safeParse(req.body);
  if (!modules.includes(moduleCode as typeof modules[number]) || !parsed.success) return res.status(400).json({ error: "Invalid training assessment submission" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const agent = await client.query("SELECT id,status FROM agents WHERE user_id=$1 FOR UPDATE", [req.auth!.id]);
    if (!agent.rowCount || !["pending", "active", "suspended"].includes(agent.rows[0].status)) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Agent application not available" }); }
    const quiz = quizzes[moduleCode];
    const correct = parsed.data.answers.reduce((n, answer, i) => n + (answer === quiz[i].answer ? 1 : 0), 0);
    const score = Math.round(correct / quiz.length * 100);
    const passed = score >= 80;
    await client.query("INSERT INTO agent_training_attempts(agent_id,module_code,score_percent,passed) VALUES($1,$2,$3,$4)", [agent.rows[0].id, moduleCode, score, passed]);
    let expiresAt: Date | null = null;
    if (passed) {
      const training = await client.query(`INSERT INTO agent_training_records(agent_id,module_code,status,score_percent,completed_at,expires_at)
        VALUES($1,$2,'verified',$3,now(),now()+interval '12 months') ON CONFLICT(agent_id,module_code) DO UPDATE SET status='verified',score_percent=EXCLUDED.score_percent,completed_at=now(),expires_at=now()+interval '12 months',verified_by=NULL RETURNING expires_at`, [agent.rows[0].id, moduleCode, score]);
      expiresAt = training.rows[0].expires_at;
    }
    await client.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata) VALUES($1,'agent.training_assessment_submitted','agent_training',$2,'success',$3::jsonb)", [req.auth!.id, agent.rows[0].id, JSON.stringify({ moduleCode, score, passed })]);
    await client.query("COMMIT");
    res.json({ moduleCode, scorePercent: score, passed, passingScore: 80, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null });
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

agentOperationsRouter.get("/agreement/current", requireRole("agent", "claimant", "finder"), async (_req, res, next) => {
  try { const r = await pool.query("SELECT id,version,body,body_sha256 FROM agent_agreement_versions WHERE legal_approved_at IS NOT NULL ORDER BY created_at DESC LIMIT 1"); if (!r.rowCount) return res.status(423).json({ error: "No legally approved Agent agreement version is available" }); res.json({ agreement: r.rows[0] }); } catch (e) { next(e); }
});
agentOperationsRouter.post("/agreement/accept", requireRole("agent", "claimant", "finder"), async (req, res, next) => {
  const parsed = z.object({ versionId: z.string().uuid(), typedFullName: z.string().trim().min(3).max(180) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide the current agreement version and your typed full name" });
  try {
    const result = await pool.query(`INSERT INTO agent_agreements(agent_id,version_id,typed_full_name,agreement_sha256,accepted_by)
      SELECT a.id,v.id,$2,v.body_sha256,$3 FROM agents a CROSS JOIN agent_agreement_versions v
      WHERE a.user_id=$3 AND a.status IN ('pending','active','suspended') AND v.id=$1 AND v.legal_approved_at IS NOT NULL
      ON CONFLICT(agent_id,version_id) DO NOTHING RETURNING id,accepted_at,agreement_sha256`, [parsed.data.versionId, parsed.data.typedFullName, req.auth!.id]);
    if (!result.rowCount) return res.status(409).json({ error: "Agent application or legally approved agreement version not found, or this version was already accepted" });
    await pool.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata) SELECT $1,'agent.agreement_accepted','agent_agreement',$2,'success',jsonb_build_object('versionId',$3::text,'agreementHash',$4::text) FROM agents WHERE user_id=$1", [req.auth!.id, result.rows[0].id, parsed.data.versionId, result.rows[0].agreement_sha256]);
    res.status(201).json({ acceptance: result.rows[0] });
  } catch (e) { next(e); }
});
agentOperationsRouter.get("/admin/agreement-versions", requireRole("admin"), async (_req,res,next)=>{try{const r=await pool.query("SELECT id,version,body_sha256,legal_approved_at,created_at FROM agent_agreement_versions ORDER BY created_at DESC");res.json({versions:r.rows});}catch(e){next(e);}});
agentOperationsRouter.post("/admin/agreement-versions", requireRole("admin"), async (req, res, next) => {
  const parsed = z.object({ version: z.string().trim().min(1).max(40), body: z.string().trim().min(100).max(30000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide a version and complete agreement text" });
  try { const hash = createHash("sha256").update(parsed.data.body).digest("hex"); const r = await pool.query("INSERT INTO agent_agreement_versions(version,body,body_sha256,created_by) VALUES($1,$2,$3,$4) RETURNING id,version,body_sha256,created_at", [parsed.data.version, parsed.data.body, hash, req.auth!.id]); res.status(201).json({ version: r.rows[0], legalApprovalRequired: true }); } catch (e) { next(e); }
});
agentOperationsRouter.post("/admin/agreement-versions/:id/legal-approve", requireRole("owner"), (req,res,next)=>requireStepUpInTransaction("admin.agreement.legal_approve")(req,res,next), async (req, res, next) => {
  const parsed = z.object({ confirmLegalReview: z.literal(true), note: z.string().trim().min(10).max(1000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Explicit legal review confirmation and note are required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id FROM agent_agreement_versions WHERE id=$1 AND legal_approved_at IS NULL FOR UPDATE", [req.params.id]);
    if (!current.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Unapproved agreement version not found" }); }
    await consumeStepUpGrantWithPgClient(client, req.auth!, "admin.agreement.legal_approve");
    const updated = await client.query("UPDATE agent_agreement_versions SET legal_approved_by=$2,legal_approved_at=now() WHERE id=$1 AND legal_approved_at IS NULL RETURNING id,version,legal_approved_at", [req.params.id, req.auth!.id]);
    if (!updated.rowCount) throw new Error("Agreement version changed during legal approval");
    await client.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata) VALUES($1,'agent.agreement_version_legally_approved','agent_agreement_version',$2,'success',$3::jsonb)", [req.auth!.id, req.params.id, JSON.stringify({ note: parsed.data.note })]);
    await client.query("COMMIT");
    res.json({ version: updated.rows[0] });
  } catch (e) { await client.query("ROLLBACK"); next(e); }
  finally { client.release(); }
});

agentOperationsRouter.post("/admin/:agentId/site-inspections", requireRole("admin"), async (req, res, next) => {
  const parsed = z.object({ outcome: z.enum(["approved", "rejected", "revisit"]), findings: z.string().trim().min(10).max(3000), evidenceReference: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide an inspection outcome and findings" });
  try { const r = await pool.query("INSERT INTO agent_site_inspections(agent_id,outcome,findings,evidence_reference,inspected_by) SELECT id,$2,$3,$4,$5 FROM agents WHERE id=$1 RETURNING id,agent_id,outcome,findings,inspected_at", [req.params.agentId, parsed.data.outcome, parsed.data.findings, parsed.data.evidenceReference ?? null, req.auth!.id]); if (!r.rowCount) return res.status(404).json({ error: "Agent not found" }); await pool.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata) VALUES($1,'agent.site_inspection_recorded','agent_site_inspection',$2,'success',$3::jsonb)", [req.auth!.id, r.rows[0].id, JSON.stringify({ outcome: parsed.data.outcome })]); res.status(201).json({ inspection: r.rows[0] }); } catch (e) { next(e); }
});

agentOperationsRouter.post("/admin/agents/:agentId/reconcile-capacity", requireRole("admin"), async (req,res,next)=>{
  const parsed=z.object({reason:z.string().trim().min(10).max(1000)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"A capacity reconciliation reason is required"});
  const c=await pool.connect();
  try{await c.query("BEGIN");const agent=await c.query("SELECT id FROM agents WHERE id=$1 FOR UPDATE",[req.params.agentId]);if(!agent.rowCount){await c.query("ROLLBACK");return res.status(404).json({error:"Agent not found"});}
    const count=await c.query("SELECT count(*)::int current_load FROM assignments WHERE agent_id=$1 AND status='assigned'",[req.params.agentId]);
    const updated=await c.query("UPDATE agent_availability SET current_load=$2,updated_at=now() WHERE agent_id=$1 RETURNING capacity_limit,current_load,available",[req.params.agentId,count.rows[0].current_load]);
    if(!updated.rowCount){await c.query("ROLLBACK");return res.status(409).json({error:"Agent availability/capacity record does not exist; create it through the Agent availability workflow first"});}
    await c.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata) VALUES($1,'agent.capacity_reconciled','agent',$2,'success',$3::jsonb)",[req.auth!.id,req.params.agentId,JSON.stringify({reason:parsed.data.reason,currentLoad:count.rows[0].current_load})]);await c.query("COMMIT");res.json({capacity:updated.rows[0],notice:"Current load reconciled to the count of active assignments; capacity limit was not changed."});
  }catch(e){await c.query("ROLLBACK");next(e);}finally{c.release();}
});
agentOperationsRouter.get("/assignments/recommendations/:reportId", requireRole("admin"), async (req, res, next) => {
  try { const r = await pool.query(`SELECT a.id agent_id,a.business_name,a.county,COALESCE(v.capacity_limit,0) capacity_limit,COALESCE(v.current_load,0) current_load,COALESCE(v.available,false) available,
    CASE WHEN a.county=r.county THEN 100 ELSE 0 END + CASE WHEN COALESCE(v.available,false) THEN 30 ELSE 0 END + GREATEST(0,20-COALESCE(v.current_load,0)) score
    FROM agents a JOIN reports r ON r.id=$1 LEFT JOIN agent_availability v ON v.agent_id=a.id
    WHERE a.status='active' AND a.verified_at IS NOT NULL AND a.county=r.county AND COALESCE(v.available,false)=true AND COALESCE(v.current_load,0)<COALESCE(v.capacity_limit,0)
      AND (SELECT count(*) FROM agent_training_records tr WHERE tr.agent_id=a.id AND tr.status='verified' AND tr.expires_at>now() AND tr.module_code IN ('custody_basics','privacy_safety','handover_incidents'))=3
      AND EXISTS(SELECT 1 FROM agent_agreements aa WHERE aa.agent_id=a.id AND aa.version_id=(SELECT id FROM agent_agreement_versions WHERE legal_approved_at IS NOT NULL ORDER BY created_at DESC LIMIT 1))
      AND (SELECT si.outcome FROM agent_site_inspections si WHERE si.agent_id=a.id ORDER BY inspected_at DESC LIMIT 1)='approved'
    ORDER BY score DESC,a.created_at ASC LIMIT 20`, [req.params.reportId]); res.json({ recommendations: r.rows, requiresAdminConfirmation: true }); } catch (e) { next(e); }
});
agentOperationsRouter.post("/assignments/:assignmentId/reassign", requireRole("admin"), async (req, res, next) => {
  const parsed = z.object({ newAgentId: z.string().uuid(), reason: z.string().trim().min(10).max(1000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide a destination Agent and documented reason" });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const a = await c.query("SELECT x.*,r.county report_county FROM assignments x JOIN reports r ON r.id=x.report_id WHERE x.id=$1 FOR UPDATE", [req.params.assignmentId]);
    if (!a.rowCount || a.rows[0].status !== "assigned") { await c.query("ROLLBACK"); return res.status(404).json({ error: "Active assignment not found" }); }
    const old = a.rows[0];
    const ev = await c.query("SELECT event_type FROM custody_events WHERE report_id=$1 ORDER BY created_at", [old.report_id]);
    const custodyStarted = ev.rows.some((x: {event_type:string}) => ["received","inspection_completed"].includes(x.event_type));
    let approvedClaimantId: string | null = null;
    let currentAgentUserId: string | null = null;
    if (custodyStarted) {
      const parties = await c.query(`SELECT a.user_id AS agent_user_id, c.claimant_id
        FROM agents a CROSS JOIN LATERAL (
          SELECT claimant_id FROM claims WHERE report_id=$1 AND status='approved'
          ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE
        ) c WHERE a.id=$2`, [old.report_id, old.agent_id]);
      if (!parties.rowCount) { await c.query("ROLLBACK"); return res.status(409).json({ error: "Current Agent and approved claimant could not be established for transfer confirmation." }); }
      currentAgentUserId = parties.rows[0].agent_user_id;
      approvedClaimantId = parties.rows[0].claimant_id;
      if (!currentAgentUserId || !approvedClaimantId || currentAgentUserId === approvedClaimantId) { await c.query("ROLLBACK"); return res.status(409).json({ error: "Distinct current Agent and claimant identities are required for a custody transfer." }); }
      const confirmations = await c.query("SELECT actor_id,actor_role FROM custody_transfer_confirmations WHERE assignment_id=$1", [old.id]);
      const agentConfirmed = confirmations.rows.some((x: {actor_id:string;actor_role:string}) => x.actor_role === "agent" && x.actor_id === currentAgentUserId);
      const claimantConfirmed = confirmations.rows.some((x: {actor_id:string;actor_role:string}) => x.actor_role === "claimant" && x.actor_id === approvedClaimantId);
      if (!agentConfirmed || !claimantConfirmed) { await c.query("ROLLBACK"); return res.status(409).json({ error: "Custody has started. The current assigned Agent and current approved claimant must each confirm this transfer." }); }
    }
    const dest = await c.query("SELECT a.id,a.county,a.status,a.verified_at,v.available,v.capacity_limit,v.current_load FROM agents a JOIN agent_availability v ON v.agent_id=a.id WHERE a.id=$1 FOR UPDATE", [parsed.data.newAgentId]);
    if (!dest.rowCount || dest.rows[0].status !== "active" || !dest.rows[0].verified_at || dest.rows[0].county !== old.report_county || !dest.rows[0].available || dest.rows[0].current_load >= dest.rows[0].capacity_limit) { await c.query("ROLLBACK"); return res.status(409).json({ error: "Destination Agent is not eligible or has no capacity" }); }
    const destinationEligibility = await c.query(`SELECT
      (SELECT outcome FROM agent_site_inspections WHERE agent_id=$1 ORDER BY inspected_at DESC LIMIT 1) site_outcome,
      (SELECT count(*) FROM agent_training_records WHERE agent_id=$1 AND status='verified' AND expires_at>now() AND module_code IN ('custody_basics','privacy_safety','handover_incidents')) training_count,
      (SELECT count(*) FROM agent_agreements aa WHERE aa.agent_id=$1 AND aa.version_id=(SELECT id FROM agent_agreement_versions WHERE legal_approved_at IS NOT NULL ORDER BY created_at DESC LIMIT 1)) agreement_count`, [parsed.data.newAgentId]);
    const eligible = destinationEligibility.rows[0];
    if (eligible.site_outcome !== 'approved' || Number(eligible.training_count)!==3 || Number(eligible.agreement_count)<1) { await c.query("ROLLBACK"); return res.status(409).json({ error: "Destination Agent has incomplete or expired verification" }); }
    const oldAgentId = old.agent_id;
    await c.query("UPDATE assignments SET status='reassigned' WHERE id=$1", [old.id]);
    const created = await c.query("INSERT INTO assignments(report_id,agent_id,assigned_by,status) VALUES($1,$2,$3,'assigned') RETURNING id,report_id,agent_id,status,assigned_at", [old.report_id, parsed.data.newAgentId, req.auth!.id]);
    await c.query("UPDATE agent_availability SET current_load=GREATEST(0,current_load-1),updated_at=now() WHERE agent_id=$1", [oldAgentId]);
    await c.query("UPDATE agent_availability SET current_load=current_load+1,updated_at=now() WHERE agent_id=$1", [parsed.data.newAgentId]);
    if (custodyStarted) {
      // The database trigger owns sequence allocation and canonical hash generation.
      await c.query("INSERT INTO custody_events(report_id,agent_id,event_type,notes,actor_id) VALUES($1,$2,'custody_transfer',$3,$4)",[old.report_id,parsed.data.newAgentId,parsed.data.reason,req.auth!.id]);
    }
    await c.query("UPDATE handover_authorisations SET consumed_at=now() WHERE assignment_id=$1 AND consumed_at IS NULL", [old.id]);
    await c.query("UPDATE agent_appointments SET status='cancelled',updated_at=now() WHERE assignment_id=$1 AND status IN ('requested','confirmed')", [old.id]);
    await c.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata) VALUES($1,'agent.assignment_reassigned','assignment',$2,'success',$3::jsonb)", [req.auth!.id, created.rows[0].id, JSON.stringify({ previousAssignmentId: old.id, oldAgentId, newAgentId: parsed.data.newAgentId, reason: parsed.data.reason, custodyTransferConfirmed: custodyStarted })]);
    await c.query("COMMIT"); res.status(201).json({ assignment: created.rows[0], previousAssignmentId: old.id, notice: "Reassignment recorded; existing custody evidence is retained." });
  } catch (e) { await c.query("ROLLBACK"); next(e); } finally { c.release(); }
});

agentOperationsRouter.post("/assignments/:assignmentId/transfer-confirm", requireRole("agent", "claimant"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const assignment = await client.query(`SELECT x.id,x.agent_id,a.user_id AS agent_user_id,c.claimant_id,
        EXISTS(SELECT 1 FROM custody_events ce WHERE ce.report_id=x.report_id AND ce.event_type IN ('received','inspection_completed')) AS custody_started
      FROM assignments x JOIN agents a ON a.id=x.agent_id
      JOIN LATERAL (SELECT claimant_id FROM claims WHERE report_id=x.report_id AND status='approved' ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE) c ON true
      WHERE x.id=$1 AND x.status='assigned' FOR UPDATE OF x`, [req.params.assignmentId]);
    if (!assignment.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Active assignment and approved claimant not found" }); }
    const party = assignment.rows[0];
    if (!party.custody_started) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Transfer confirmations are only accepted after physical custody has begun" }); }
    const isAgent = req.auth!.roles.includes("agent") && party.agent_user_id === req.auth!.id;
    const isClaimant = req.auth!.roles.includes("claimant") && party.claimant_id === req.auth!.id;
    if (!isAgent && !isClaimant) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Only the current assigned Agent or current approved claimant may confirm this custody transfer" }); }
    if (isAgent && isClaimant) { await client.query("ROLLBACK"); return res.status(409).json({ error: "The same individual cannot provide both independent transfer confirmations" }); }
    const role = isAgent ? "agent" : "claimant";
    await client.query("INSERT INTO custody_transfer_confirmations(assignment_id,actor_id,actor_role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [req.params.assignmentId, req.auth!.id, role]);
    const confirmations = await client.query("SELECT actor_id,actor_role,confirmed_at FROM custody_transfer_confirmations WHERE assignment_id=$1 ORDER BY confirmed_at", [req.params.assignmentId]);
    const agentConfirmed = confirmations.rows.some((x: {actor_id:string;actor_role:string}) => x.actor_role === "agent" && x.actor_id === party.agent_user_id);
    const claimantConfirmed = confirmations.rows.some((x: {actor_id:string;actor_role:string}) => x.actor_role === "claimant" && x.actor_id === party.claimant_id);
    await client.query("COMMIT");
    res.status(201).json({ confirmed: true, actorRole: role, confirmations: confirmations.rows.map((x: {actor_role:string;confirmed_at:Date}) => ({actorRole:x.actor_role,confirmedAt:x.confirmed_at})), reassignmentEnabled: agentConfirmed && claimantConfirmed });
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

agentOperationsRouter.post("/claims/:claimId/confirm-handover", requireRole("claimant"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Resolve the report without a lock, then take the same report -> claim ->
    // assignment order as final release. This prevents a late confirmation
    // being attached to a completed claim or a superseded assignment.
    const reference = await client.query("SELECT report_id FROM claims WHERE id=$1", [req.params.claimId]);
    if (!reference.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Claim not found" }); }
    await client.query("SELECT id FROM reports WHERE id=$1 FOR UPDATE", [reference.rows[0].report_id]);
    const claim = await client.query("SELECT id,report_id,claimant_id,status FROM claims WHERE id=$1 FOR UPDATE", [req.params.claimId]);
    if (!claim.rowCount || claim.rows[0].claimant_id !== req.auth!.id || claim.rows[0].status !== "approved") {
      await client.query("ROLLBACK"); return res.status(409).json({ error: "An approved claim belonging to the signed-in claimant is required" });
    }
    const assignment = await client.query("SELECT id,agent_id FROM assignments WHERE report_id=$1 AND status='assigned' FOR UPDATE", [claim.rows[0].report_id]);
    if (assignment.rowCount !== 1) { await client.query("ROLLBACK"); return res.status(409).json({ error: "A single active Agent assignment is required" }); }
    const eligible = await client.query(`SELECT 1 WHERE
      EXISTS(SELECT 1 FROM payment_transactions pt JOIN payment_assessments pa ON pa.id=pt.assessment_id WHERE pt.claim_id=$1 AND pt.status='confirmed' AND pa.status='paid')
      AND EXISTS(SELECT 1 FROM custody_events ce WHERE ce.report_id=$2 AND ce.agent_id=$3 AND ce.event_type='handover_ready'
        AND ce.sequence_no>COALESCE((SELECT max(ct.sequence_no) FROM custody_events ct WHERE ct.report_id=$2 AND ct.event_type='custody_transfer'),0))
      AND NOT EXISTS(SELECT 1 FROM case_disputes d WHERE d.claim_id=$1 AND d.release_hold=true AND d.status NOT IN ('resolved','closed','dismissed'))
      AND NOT EXISTS(SELECT 1 FROM privacy_legal_holds h WHERE h.status='active' AND (
        (h.subject_type='claim' AND h.subject_id=$1::text) OR
        (h.subject_type='report' AND h.subject_id=$2::text) OR
        (h.subject_type='assignment' AND h.subject_id=$4::text)
      ))`, [claim.rows[0].id, claim.rows[0].report_id, assignment.rows[0].agent_id, assignment.rows[0].id]);
    if (!eligible.rowCount) { await client.query("ROLLBACK"); return res.status(423).json({ error: "Claimant confirmation requires verified payment, Agent-recorded readiness and no active dispute or legal hold" }); }
    const r = await client.query(`INSERT INTO custody_handover_confirmations(report_id,claim_id,assignment_id,claimant_id,agent_id)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(claim_id,assignment_id) DO NOTHING RETURNING id,confirmed_at`,
      [claim.rows[0].report_id, claim.rows[0].id, assignment.rows[0].id, claim.rows[0].claimant_id, assignment.rows[0].agent_id]);
    if (!r.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Claimant confirmation has already been recorded for this assignment" }); }
    await client.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome) VALUES($1,'claim.handover_claimant_confirmed','claim',$2,'success')", [req.auth!.id, req.params.claimId]);
    await client.query("COMMIT");
    res.status(201).json({ confirmation: r.rows[0], finalRelease: "awaiting_agent_release_confirmation" });
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

agentOperationsRouter.post("/availability/windows", requireRole("agent"), async (req, res, next) => {
  const parsed = z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime() }).safeParse(req.body);
  if (!parsed.success || new Date(parsed.data.startsAt) <= new Date() || new Date(parsed.data.endsAt).getTime()-new Date(parsed.data.startsAt).getTime()>12*60*60_000) return res.status(400).json({ error: "Publish a future availability window no longer than 12 hours" });
  try { const r = await pool.query(`INSERT INTO agent_availability_windows(agent_id,starts_at,ends_at) SELECT id,$2,$3 FROM agents WHERE user_id=$1 AND status='active' RETURNING id,starts_at,ends_at,timezone,published_at`, [req.auth!.id,parsed.data.startsAt,parsed.data.endsAt]); if (!r.rowCount) return res.status(403).json({ error: "An active Agent account is required" }); await pool.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome) VALUES($1,'agent.availability_window_published','agent_availability_window',$2,'success')", [req.auth!.id,r.rows[0].id]); res.status(201).json({ window:r.rows[0] }); } catch(e) { next(e); }
});
agentOperationsRouter.get("/availability/windows/mine", requireRole("agent"), async (req,res,next)=>{try{const r=await pool.query("SELECT w.* FROM agent_availability_windows w JOIN agents a ON a.id=w.agent_id WHERE a.user_id=$1 AND w.ends_at>now() ORDER BY w.starts_at",[req.auth!.id]);res.json({windows:r.rows,timezone:"Africa/Nairobi"});}catch(e){next(e);}});
agentOperationsRouter.get("/appointments/mine", requireRole("agent"), async (req, res, next) => { try { const r = await pool.query(`SELECT p.*,r.reference FROM agent_appointments p JOIN agents a ON a.id=p.agent_id JOIN claims c ON c.id=p.claim_id JOIN reports r ON r.id=c.report_id WHERE a.user_id=$1 ORDER BY p.starts_at`, [req.auth!.id]); res.json({ appointments: r.rows, timezone: "Africa/Nairobi" }); } catch (e) { next(e); } });
agentOperationsRouter.get("/claimant/assignments", requireRole("claimant"), async (req, res, next) => {
  try { const r = await pool.query(`SELECT x.id assignment_id,c.id claim_id,r.reference, a.business_name agent_name,a.county,
      EXISTS(SELECT 1 FROM custody_events ce WHERE ce.report_id=c.report_id AND ce.agent_id=x.agent_id AND ce.event_type='handover_ready'
        AND ce.sequence_no>COALESCE((SELECT max(ct.sequence_no) FROM custody_events ct WHERE ct.report_id=c.report_id AND ct.event_type='custody_transfer'),0)) AS handover_ready,
      EXISTS(SELECT 1 FROM custody_handover_confirmations hc WHERE hc.claim_id=c.id AND hc.assignment_id=x.id AND hc.claimant_id=c.claimant_id AND hc.agent_id=x.agent_id) AS claimant_confirmed,
      (SELECT ap.status FROM agent_appointments ap WHERE ap.claim_id=c.id AND ap.assignment_id=x.id ORDER BY ap.created_at DESC LIMIT 1) AS appointment_status,
      (SELECT ap.starts_at FROM agent_appointments ap WHERE ap.claim_id=c.id AND ap.assignment_id=x.id ORDER BY ap.created_at DESC LIMIT 1) AS appointment_starts_at,
      (SELECT ap.ends_at FROM agent_appointments ap WHERE ap.claim_id=c.id AND ap.assignment_id=x.id ORDER BY ap.created_at DESC LIMIT 1) AS appointment_ends_at,
      COALESCE((SELECT json_agg(json_build_object('id',w.id,'startsAt',w.starts_at,'endsAt',w.ends_at,'timezone',w.timezone) ORDER BY w.starts_at) FROM agent_availability_windows w WHERE w.agent_id=a.id AND w.ends_at>now()),'[]'::json) availability_windows
    FROM claims c JOIN reports r ON r.id=c.report_id JOIN assignments x ON x.report_id=r.id AND x.status='assigned' JOIN agents a ON a.id=x.agent_id
    WHERE c.claimant_id=$1 AND c.status='approved' ORDER BY c.approved_at DESC`, [req.auth!.id]); res.json({ assignments: r.rows, timezone: "Africa/Nairobi" }); } catch (e) { next(e); }
});
agentOperationsRouter.post("/appointments/request", requireRole("claimant"), async (req, res, next) => {
  const parsed = z.object({ assignmentId: z.string().uuid(), startsAt: z.string().datetime(), endsAt: z.string().datetime() }).safeParse(req.body);
  if (!parsed.success || new Date(parsed.data.endsAt) <= new Date(parsed.data.startsAt) || new Date(parsed.data.endsAt).getTime() - new Date(parsed.data.startsAt).getTime() > 2*60*60_000 || new Date(parsed.data.startsAt) <= new Date()) return res.status(400).json({ error: "Provide a future appointment window no longer than two hours" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reference = await client.query(`SELECT c.id claim_id,c.report_id FROM assignments x JOIN claims c ON c.report_id=x.report_id
      WHERE x.id=$1 AND c.claimant_id=$2 AND c.status='approved'`, [parsed.data.assignmentId, req.auth!.id]);
    if (reference.rowCount !== 1) { await client.query("ROLLBACK"); return res.status(409).json({ error: "An approved claim and current assignment are required" }); }
    await client.query("SELECT id FROM reports WHERE id=$1 FOR UPDATE", [reference.rows[0].report_id]);
    const claim = await client.query("SELECT id,report_id,claimant_id,status FROM claims WHERE id=$1 FOR UPDATE", [reference.rows[0].claim_id]);
    if (!claim.rowCount || claim.rows[0].claimant_id !== req.auth!.id || claim.rows[0].status !== "approved") { await client.query("ROLLBACK"); return res.status(409).json({ error: "The claim is no longer eligible for an appointment" }); }
    const assignment = await client.query(`SELECT x.id,x.agent_id,a.status agent_status,a.verified_at FROM assignments x JOIN agents a ON a.id=x.agent_id
      WHERE x.id=$1 AND x.report_id=$2 AND x.status='assigned' FOR UPDATE OF x,a`, [parsed.data.assignmentId, claim.rows[0].report_id]);
    if (!assignment.rowCount || assignment.rows[0].agent_status !== "active" || !assignment.rows[0].verified_at) { await client.query("ROLLBACK"); return res.status(409).json({ error: "The assigned Agent is no longer active and verified" }); }
    const gates = await client.query(`SELECT 1 WHERE
      EXISTS(SELECT 1 FROM agent_availability_windows w WHERE w.agent_id=$1 AND $2::timestamptz>=w.starts_at AND $3::timestamptz<=w.ends_at)
      AND NOT EXISTS(SELECT 1 FROM case_disputes d WHERE d.claim_id=$4 AND d.release_hold=true AND d.status NOT IN ('resolved','closed','dismissed'))
      AND NOT EXISTS(SELECT 1 FROM privacy_legal_holds h WHERE h.status='active' AND (
        (h.subject_type='claim' AND h.subject_id=$4::text) OR
        (h.subject_type='report' AND h.subject_id=$5::text) OR
        (h.subject_type='assignment' AND h.subject_id=$6::text)
      ))`, [assignment.rows[0].agent_id, parsed.data.startsAt, parsed.data.endsAt, claim.rows[0].id, claim.rows[0].report_id, assignment.rows[0].id]);
    if (!gates.rowCount) { await client.query("ROLLBACK"); return res.status(423).json({ error: "Appointment requires an available Agent and no active dispute or legal hold" }); }
    const created = await client.query(`INSERT INTO agent_appointments(assignment_id,claim_id,agent_id,claimant_id,starts_at,ends_at,requested_by)
      VALUES($1,$2,$3,$4,$5,$6,$4) RETURNING id,starts_at,ends_at,status,timezone`,
      [assignment.rows[0].id, claim.rows[0].id, assignment.rows[0].agent_id, claim.rows[0].claimant_id, parsed.data.startsAt, parsed.data.endsAt]);
    await client.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome) VALUES($1,'claim.collection_appointment_requested','appointment',$2,'success')", [req.auth!.id, created.rows[0].id]);
    await client.query("COMMIT");
    res.status(201).json({ appointment: created.rows[0] });
  } catch (e) { await client.query("ROLLBACK"); if ((e as {code?:string}).code === "P0001") return res.status(409).json({ error: "The Agent already has an overlapping appointment" }); next(e); } finally { client.release(); }
});

agentOperationsRouter.patch("/appointments/:id/confirm", requireRole("agent"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reference = await client.query("SELECT claim_id,assignment_id FROM agent_appointments WHERE id=$1", [req.params.id]);
    if (!reference.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Appointment request not found" }); }
    const target = await client.query("SELECT report_id FROM claims WHERE id=$1", [reference.rows[0].claim_id]);
    if (!target.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Appointment claim not found" }); }
    await client.query("SELECT id FROM reports WHERE id=$1 FOR UPDATE", [target.rows[0].report_id]);
    const claim = await client.query("SELECT id,report_id,claimant_id,status FROM claims WHERE id=$1 FOR UPDATE", [reference.rows[0].claim_id]);
    const assignment = await client.query(`SELECT x.id,x.agent_id,a.user_id,a.status agent_status,a.verified_at FROM assignments x JOIN agents a ON a.id=x.agent_id
      WHERE x.id=$1 AND x.report_id=$2 AND x.status='assigned' FOR UPDATE OF x,a`, [reference.rows[0].assignment_id, target.rows[0].report_id]);
    const appointment = await client.query("SELECT id,claim_id,assignment_id,agent_id,claimant_id,status,starts_at,ends_at FROM agent_appointments WHERE id=$1 AND assignment_id=$2 FOR UPDATE", [req.params.id, reference.rows[0].assignment_id]);
    if (!claim.rowCount || claim.rows[0].status !== "approved" || !assignment.rowCount || assignment.rows[0].agent_status !== "active" || !assignment.rows[0].verified_at || assignment.rows[0].user_id !== req.auth!.id || !appointment.rowCount || appointment.rows[0].claim_id !== claim.rows[0].id || appointment.rows[0].agent_id !== assignment.rows[0].agent_id || appointment.rows[0].claimant_id !== claim.rows[0].claimant_id || appointment.rows[0].status !== "requested" || new Date(appointment.rows[0].starts_at) <= new Date()) {
      await client.query("ROLLBACK"); return res.status(409).json({ error: "Only the current verified Agent can confirm a future appointment for an approved claim and active assignment" });
    }
    const gates = await client.query(`SELECT 1 WHERE
      NOT EXISTS(SELECT 1 FROM case_disputes d WHERE d.claim_id=$1 AND d.release_hold=true AND d.status NOT IN ('resolved','closed','dismissed'))
      AND NOT EXISTS(SELECT 1 FROM privacy_legal_holds h WHERE h.status='active' AND (
        (h.subject_type='claim' AND h.subject_id=$1::text) OR
        (h.subject_type='report' AND h.subject_id=$2::text) OR
        (h.subject_type='assignment' AND h.subject_id=$3::text)
      ))`, [claim.rows[0].id, claim.rows[0].report_id, assignment.rows[0].id]);
    if (!gates.rowCount) { await client.query("ROLLBACK"); return res.status(423).json({ error: "An active dispute or legal hold prevents appointment confirmation" }); }
    const updated = await client.query("UPDATE agent_appointments SET status='confirmed',confirmed_by=$2,confirmed_at=now(),updated_at=now() WHERE id=$1 AND status='requested' RETURNING id,starts_at,ends_at,status", [req.params.id, req.auth!.id]);
    if (!updated.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Appointment changed before confirmation" }); }
    await client.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome) VALUES($1,'claim.collection_appointment_confirmed','appointment',$2,'success')", [req.auth!.id, req.params.id]);
    await client.query("COMMIT"); res.json({ appointment: updated.rows[0] });
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

agentOperationsRouter.patch("/appointments/:id/decline", requireRole("agent"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reference = await client.query("SELECT claim_id,assignment_id FROM agent_appointments WHERE id=$1", [req.params.id]);
    if (!reference.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Appointment request not found" }); }
    const target = await client.query("SELECT report_id FROM claims WHERE id=$1", [reference.rows[0].claim_id]);
    if (!target.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Appointment claim not found" }); }
    await client.query("SELECT id FROM reports WHERE id=$1 FOR UPDATE", [target.rows[0].report_id]);
    const claim = await client.query("SELECT id,claimant_id,status FROM claims WHERE id=$1 FOR UPDATE", [reference.rows[0].claim_id]);
    const assignment = await client.query(`SELECT x.id,x.agent_id,a.user_id,a.status agent_status,a.verified_at FROM assignments x JOIN agents a ON a.id=x.agent_id
      WHERE x.id=$1 AND x.report_id=$2 AND x.status='assigned' FOR UPDATE OF x,a`, [reference.rows[0].assignment_id, target.rows[0].report_id]);
    if (!claim.rowCount || claim.rows[0].status !== "approved" || !assignment.rowCount || assignment.rows[0].user_id !== req.auth!.id || assignment.rows[0].agent_status !== "active" || !assignment.rows[0].verified_at) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Only the current active verified Agent can decline an appointment for an approved claim" }); }
    const appointment = await client.query("SELECT id,claim_id,assignment_id,agent_id,claimant_id,status FROM agent_appointments WHERE id=$1 AND assignment_id=$2 FOR UPDATE", [req.params.id, reference.rows[0].assignment_id]);
    if (!appointment.rowCount || appointment.rows[0].claim_id !== claim.rows[0].id || appointment.rows[0].agent_id !== assignment.rows[0].agent_id || appointment.rows[0].claimant_id !== claim.rows[0].claimant_id || appointment.rows[0].status !== "requested") { await client.query("ROLLBACK"); return res.status(409).json({ error: "Appointment is no longer eligible for this Agent's response" }); }
    const updated = await client.query("UPDATE agent_appointments SET status='declined',updated_at=now() WHERE id=$1 AND assignment_id=$2 AND status='requested' RETURNING id,status", [req.params.id, reference.rows[0].assignment_id]);
    if (!updated.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Appointment is no longer awaiting a response" }); }
    await client.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome) VALUES($1,'claim.collection_appointment_declined','appointment',$2,'success')", [req.auth!.id, req.params.id]);
    await client.query("COMMIT"); res.json({ appointment: updated.rows[0] });
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

// Admin records an in-person claimant/representative check; no raw ID number is stored.
agentOperationsRouter.post("/admin/claims/:claimId/collection-check", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.claim.collection_identity.check")(req, res, next), async (req, res, next) => {
  const parsed = z.object({ authorityStatus: z.enum(["verified","not_required"]), evidenceReference: z.string().max(500).optional(), notes: z.string().trim().min(5).max(1000).refine(value => !/\b\d{7,}\b/.test(value), "Do not include an identity number") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide the authority decision and a concise verification note" });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Lock the approved claim and its current assignment before recording the
    // in-person identity/authority check. Code issuance uses the same claim ->
    // assignment lock order, so reassignment or a concurrent claim decision
    // cannot race this check and leave it attached to a stale assignment.
    const eligible = await c.query(`SELECT c.id claim_id,c.claimant_id,x.id assignment_id
      FROM claims c JOIN assignments x ON x.report_id=c.report_id AND x.status='assigned'
      WHERE c.id=$1 AND c.status='approved'
        AND ((c.claimant_relationship='owner' AND $2='not_required')
          OR (c.claimant_relationship<>'owner' AND c.authority_verification_status='verified' AND $2='verified'))
      ORDER BY x.assigned_at DESC LIMIT 1 FOR UPDATE OF c,x`, [req.params.claimId, parsed.data.authorityStatus]);
    if (!eligible.rowCount) { await c.query("ROLLBACK"); return res.status(409).json({ error: "Only an approved claim with a current assignment and the required independently verified representative authority can be checked" }); }
    const row = eligible.rows[0];
    const r = await c.query(`INSERT INTO agent_collection_checks(assignment_id,claim_id,claimant_id,authority_status,identity_checked_by,authority_evidence_ref,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(assignment_id,claim_id) DO UPDATE SET authority_status=EXCLUDED.authority_status,identity_checked_by=EXCLUDED.identity_checked_by,identity_checked_at=now(),authority_evidence_ref=EXCLUDED.authority_evidence_ref,notes=EXCLUDED.notes
      RETURNING id,claim_id,authority_status,identity_checked_at`, [row.assignment_id, row.claim_id, row.claimant_id, parsed.data.authorityStatus, req.auth!.id, parsed.data.evidenceReference ?? null, parsed.data.notes]);
    await consumeStepUpGrantWithPgClient(c, req.auth!, "admin.claim.collection_identity.check");
    await c.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata) VALUES($1,'claim.collection_identity_checked','claim',$2,'success',$3::jsonb)", [req.auth!.id, req.params.claimId, JSON.stringify({ authorityStatus: parsed.data.authorityStatus })]);
    await c.query("COMMIT");
    res.status(201).json({ collectionCheck: r.rows[0] });
  } catch (e) { await c.query("ROLLBACK"); next(e); } finally { c.release(); }
});
agentOperationsRouter.post("/admin/claims/:claimId/collection-code", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.claim.collection_code.issue")(req, res, next), async (req, res, next) => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Use the same report -> claim -> assignment -> appointment lock order as
    // final release and appointment decisions. This prevents a code being
    // issued against an appointment that is concurrently invalidated.
    const claimRef = await c.query("SELECT report_id FROM claims WHERE id=$1", [req.params.claimId]);
    if (!claimRef.rowCount) { await c.query("ROLLBACK"); return res.status(404).json({ error: "Claim not found" }); }
    const report = await c.query("SELECT id FROM reports WHERE id=$1 FOR UPDATE", [claimRef.rows[0].report_id]);
    if (!report.rowCount) { await c.query("ROLLBACK"); return res.status(404).json({ error: "Found report not found" }); }
    const claim = await c.query("SELECT id,report_id,claimant_id,status FROM claims WHERE id=$1 AND report_id=$2 FOR UPDATE", [req.params.claimId, report.rows[0].id]);
    if (!claim.rowCount || claim.rows[0].status !== "approved") { await c.query("ROLLBACK"); return res.status(409).json({ error: "Only the currently approved claim can receive a collection code" }); }
    const assignment = await c.query(`SELECT x.id assignment_id,x.agent_id,a.status agent_status,a.verified_at,u.email claimant_email,r.reference
      FROM assignments x JOIN agents a ON a.id=x.agent_id JOIN users u ON u.id=$2 JOIN reports r ON r.id=x.report_id
      WHERE x.report_id=$1 AND x.status='assigned' ORDER BY x.assigned_at DESC LIMIT 1 FOR UPDATE OF x,a`, [claim.rows[0].report_id, claim.rows[0].claimant_id]);
    if (!assignment.rowCount || assignment.rows[0].agent_status !== 'active' || !assignment.rows[0].verified_at) { await c.query("ROLLBACK"); return res.status(409).json({ error: "A current assignment to an active verified Agent is required" }); }
    const check = await c.query(`SELECT identity_checked_by FROM agent_collection_checks
      WHERE claim_id=$1 AND assignment_id=$2 AND authority_status IN ('verified','not_required') FOR UPDATE`, [claim.rows[0].id, assignment.rows[0].assignment_id]);
    if (!check.rowCount) { await c.query("ROLLBACK"); return res.status(409).json({ error: "A current claimant identity and representative-authority check is required" }); }
    if (check.rows[0].identity_checked_by === req.auth!.id) { await c.query("ROLLBACK"); return res.status(403).json({ error: "The administrator who completed the claimant identity/authority check cannot also issue the collection code." }); }
    const appointment = await c.query(`SELECT id,starts_at,ends_at FROM agent_appointments
      WHERE assignment_id=$1 AND claim_id=$2 AND agent_id=$3 AND claimant_id=$4
        AND status='confirmed' AND starts_at>now() AND starts_at<=now()+interval '24 hours' AND ends_at>now()
      ORDER BY starts_at DESC LIMIT 1 FOR UPDATE`, [assignment.rows[0].assignment_id, claim.rows[0].id, assignment.rows[0].agent_id, claim.rows[0].claimant_id]);
    if (!appointment.rowCount) { await c.query("ROLLBACK"); return res.status(409).json({ error: "A confirmed, current collection appointment beginning within 24 hours is required" }); }
    const releaseHolds = await c.query(`SELECT 1 WHERE
      NOT EXISTS(SELECT 1 FROM case_disputes d WHERE d.claim_id=$1 AND d.release_hold=true AND d.status NOT IN ('resolved','closed','dismissed'))
      AND NOT EXISTS(SELECT 1 FROM privacy_legal_holds h WHERE h.status='active' AND (
        (h.subject_type='claim' AND h.subject_id=$1::text) OR
        (h.subject_type='report' AND h.subject_id=$2::text) OR
        (h.subject_type='assignment' AND h.subject_id=$3::text)
      ))`, [claim.rows[0].id, claim.rows[0].report_id, assignment.rows[0].assignment_id]);
    if (!releaseHolds.rowCount) { await c.query("ROLLBACK"); return res.status(423).json({ error: "An active dispute or legal hold prevents collection-code issuance" }); }
    const payment = await c.query(`SELECT 1 FROM payment_transactions pt JOIN payment_assessments pa ON pa.id=pt.assessment_id
      WHERE pt.claim_id=$1 AND pt.status='confirmed' AND pa.status='paid' LIMIT 1`, [claim.rows[0].id]);
    if (!payment.rowCount) { await c.query("ROLLBACK"); return res.status(409).json({ error: "Provider-confirmed claimant payment is required before collection-code issuance" }); }
    const existing = await c.query("SELECT id FROM handover_authorisations WHERE report_id=$1 AND purpose='claimant_collection' AND consumed_at IS NULL AND expires_at>now() LIMIT 1 FOR UPDATE", [claim.rows[0].report_id]);
    if (existing.rowCount) { await c.query("ROLLBACK"); return res.status(409).json({ error: "An unexpired claimant collection code is already active" }); }
    await consumeStepUpGrantWithPgClient(c, req.auth!, "admin.claim.collection_code.issue");
    const code = String(randomInt(0,1_000_000)).padStart(6,"0");
    const authorization = await c.query(`INSERT INTO handover_authorisations(report_id,claim_id,assignment_id,purpose,code_hash,expires_at,created_by)
      VALUES($1,$2,$3,'claimant_collection',$4,LEAST(now()+interval '24 hours',$5::timestamptz),$6) RETURNING expires_at`, [claim.rows[0].report_id,claim.rows[0].id,assignment.rows[0].assignment_id,codeHash(code),appointment.rows[0].ends_at,req.auth!.id]);
    await c.query("COMMIT");
    let delivery: "email" | "development_log";
    try { delivery = await sendClaimantCollectionCode({ email: assignment.rows[0].claimant_email, reference: assignment.rows[0].reference, code }); }
    catch { await pool.query("UPDATE handover_authorisations SET consumed_at=now() WHERE report_id=$1 AND claim_id=$2 AND assignment_id=$3 AND purpose='claimant_collection' AND consumed_at IS NULL", [claim.rows[0].report_id,claim.rows[0].id,assignment.rows[0].assignment_id]); await pool.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata) VALUES($1,'claim.collection_code_delivery_failed','claim',$2,'denied','{\"codeInvalidated\":true}'::jsonb)", [req.auth!.id, req.params.claimId]); return res.status(503).json({ error: "Private collection-code delivery failed; the code was invalidated. Resolve email delivery before retrying." }); }
    await pool.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata) VALUES($1,'claim.collection_code_issued','claim',$2,'success',$3::jsonb)", [req.auth!.id, req.params.claimId, JSON.stringify({ delivery, expiresAt: authorization.rows[0].expires_at })]);
    res.status(201).json({ issued: true, expiresAt: authorization.rows[0].expires_at, delivery, notice: "The code is not returned by the API and expires no later than the confirmed appointment end or 24 hours after issuance." });
  } catch (e) { await c.query("ROLLBACK"); next(e); } finally { c.release(); }
});
