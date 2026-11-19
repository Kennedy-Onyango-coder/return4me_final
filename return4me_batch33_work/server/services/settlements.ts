import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditEvents, financialJournals, financialPostings, rewardAuthorizations, settlements } from "../db/schema.js";
import { allocateGrossKes, getSettlementEligibilityTime } from "../../shared/financial-policy.js";
import { centsToKes, validateBalancedJournal } from "../../shared/ledger-policy.js";

export async function verifyRewardAuthorizationAndCreateSettlement(authorizationId: string, verifierId: string) {
  return db.transaction(async tx => {
    const [authorization] = await tx.select().from(rewardAuthorizations).where(sql`${rewardAuthorizations.id}=${authorizationId}`).limit(1).for("update");
    if (!authorization || authorization.status !== "pending_verification") throw new Error("reward_authorization_not_pending");
    if (authorization.createdBy === verifierId) throw new Error("reward_authorization_requires_independent_verifier");

    const gate = await tx.execute(sql`SELECT c.id claim_id,c.claimant_id,r.reporter_id finder_user_id,a.user_id agent_user_id,
        released.created_at recovery_confirmed_at,x.id assignment_id
      FROM claims c JOIN reports r ON r.id=c.report_id
      JOIN assignments x ON x.report_id=c.report_id AND x.status='assigned'
      JOIN agents a ON a.id=x.agent_id AND a.status='active' AND a.verified_at IS NOT NULL
      JOIN custody_events released ON released.report_id=c.report_id AND released.agent_id=a.id AND released.event_type='released'
      WHERE c.id=${authorization.claimId} AND c.status='completed'
        AND r.reporter_id IS NOT NULL AND r.reporter_id<>c.claimant_id AND a.user_id<>c.claimant_id AND a.user_id<>r.reporter_id
        AND EXISTS(SELECT 1 FROM payment_transactions pt JOIN payment_assessments pa ON pa.id=pt.assessment_id
          WHERE pt.claim_id=c.id AND pt.status='confirmed' AND pa.status='paid')
        AND EXISTS(SELECT 1 FROM custody_handover_confirmations hc WHERE hc.claim_id=c.id AND hc.assignment_id=x.id AND hc.claimant_id=c.claimant_id AND hc.agent_id=x.agent_id)
        AND NOT EXISTS(SELECT 1 FROM case_disputes d WHERE d.claim_id=c.id AND d.settlement_hold=true AND d.status NOT IN ('resolved','closed','dismissed'))
      ORDER BY released.created_at DESC LIMIT 1 FOR UPDATE OF c,x`);
    const rows = (gate as any).rows ?? [];
    if (!rows.length) throw new Error("claim_not_settlement_eligible_or_beneficiaries_unverified");
    const facts = rows[0];
    const allocation = allocateGrossKes(Number(authorization.grossKes));
    const finderKes = centsToKes(allocation.finderCents);
    const agentKes = centsToKes(allocation.agentCents);
    const platformKes = centsToKes(allocation.platformCents);
    const settleAt = getSettlementEligibilityTime(new Date(facts.recovery_confirmed_at));
    const [settlement] = await tx.insert(settlements).values({ claimId: authorization.claimId,
      finderUserId: facts.finder_user_id, agentUserId: facts.agent_user_id, grossKes: centsToKes(allocation.grossCents),
      finderKes, agentKes, platformKes, finderPercent: 33, agentPercent: 25, platformPercent: 42,
      status: "eligible", settleAt }).returning();

    const journalLines = validateBalancedJournal([
      { accountCode: "REWARD_FUNDING_CLEARING", debitCents: allocation.grossCents, memo: "Verified external reward funding" },
      ...(allocation.finderCents > 0 ? [{ accountCode: "FINDER_REWARD_PAYABLE", creditCents: allocation.finderCents, memo: "Finder reward payable" }] : []),
      ...(allocation.agentCents > 0 ? [{ accountCode: "AGENT_REWARD_PAYABLE", creditCents: allocation.agentCents, memo: "Agent reward payable" }] : []),
      ...(allocation.platformCents > 0 ? [{ accountCode: "PLATFORM_REWARD_HOLDING", creditCents: allocation.platformCents, memo: "Platform allocation holding" }] : []),
    ]);
    const [journal] = await tx.insert(financialJournals).values({ sourceType: "settlement", sourceId: settlement.id,
      idempotencyKey: `settlement:${settlement.id}`, currency: "KES", memo: "Verified reward funding and immutable Finder/Agent/Platform allocation" }).returning();
    await tx.insert(financialPostings).values(journalLines.lines.map(line => ({ journalId: journal.id, accountCode: line.accountCode,
      debitKes: centsToKes(line.debitCents), creditKes: centsToKes(line.creditCents), memo: line.memo })));
    await tx.update(rewardAuthorizations).set({ status: "verified", verifiedBy: verifierId, verifiedAt: new Date() }).where(sql`${rewardAuthorizations.id}=${authorization.id}`);
    await tx.insert(auditEvents).values({ actorId: verifierId, action: "finance.reward_funding_verified", resourceType: "reward_authorization", resourceId: authorization.id,
      outcome: "success", metadata: { settlementId: settlement.id, grossKes: settlement.grossKes, finderPercent: 33, agentPercent: 25, platformPercent: 42, settleAt: settleAt.toISOString() } });
    return settlement;
  });
}
