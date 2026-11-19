import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditEvents, matchCandidates, reports } from "../db/schema.js";
import { authenticate, requireRole } from "../security.js";
import { evaluatePotentialMatch } from "../../shared/matching-policy.js";

export const matchingRouter = Router();
matchingRouter.use(authenticate, requireRole("admin", "trust_safety"));

matchingRouter.post("/reports/:reportId/evaluate", async (req, res, next) => {
  try {
    const [lost] = await db.select().from(reports).where(eq(reports.id, req.params.reportId)).limit(1);
    if (!lost || lost.kind !== "lost") return res.status(404).json({ error: "Lost report not found" });
    if (["closed", "rejected"].includes(lost.status)) return res.status(409).json({ error: "Closed reports are not eligible for matching review" });

    const foundRows = await db.select().from(reports).where(and(
      eq(reports.kind, "found"),
      eq(reports.category, lost.category),
      inArray(reports.status, ["submitted", "under_review", "published", "matched"])
    )).orderBy(desc(reports.createdAt)).limit(300);

    const evaluated = foundRows.map((found) => ({ found, evaluation: evaluatePotentialMatch(lost, found) }))
      .filter((row): row is { found: typeof foundRows[number]; evaluation: NonNullable<ReturnType<typeof evaluatePotentialMatch>> } => row.evaluation !== null)
      .sort((a, b) => b.evaluation.score - a.evaluation.score)
      .slice(0, 50);

    const persisted = await db.transaction(async (tx) => {
      for (const row of evaluated) {
        await tx.insert(matchCandidates).values({
          lostReportId: lost.id,
          foundReportId: row.found.id,
          matchTier: row.evaluation.tier,
          score: row.evaluation.score,
          reasons: row.evaluation.reasons,
          status: "pending_review"
        }).onConflictDoUpdate({
          target: [matchCandidates.lostReportId, matchCandidates.foundReportId],
          set: { matchTier: row.evaluation.tier, score: row.evaluation.score, reasons: row.evaluation.reasons, status: "pending_review" }
        });
      }
      await tx.insert(auditEvents).values({
        actorId: req.auth!.id,
        action: "matching.candidates_evaluated",
        resourceType: "report",
        resourceId: lost.id,
        outcome: "success",
        metadata: { candidateCount: evaluated.length, algorithm: "category-subcategory-approved-rule-v1" }
      });
      return evaluated.map(({ found, evaluation }) => ({
        foundReportId: found.id,
        foundReference: found.reference,
        category: found.category,
        county: found.county,
        reportStatus: found.status,
        matchTier: evaluation.tier,
        score: evaluation.score,
        reasons: evaluation.reasons
      }));
    });

    res.json({ candidates: persisted, notice: "Candidates are for authorised human review only. A match is not proof of ownership." });
  } catch (error) { next(error); }
});

matchingRouter.get("/reports/:reportId/candidates", async (req, res, next) => {
  try {
    const rows = await db.select({
      candidate: matchCandidates,
      foundReference: reports.reference,
      category: reports.category,
      county: reports.county,
      reportStatus: reports.status
    }).from(matchCandidates).innerJoin(reports, eq(matchCandidates.foundReportId, reports.id))
      .where(eq(matchCandidates.lostReportId, req.params.reportId)).orderBy(desc(matchCandidates.score));
    res.json({ candidates: rows });
  } catch (error) { next(error); }
});

matchingRouter.patch("/candidates/:candidateId/review", async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["reviewed_candidate", "rejected_candidate", "false_positive"]), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid candidate review decision" });
    const [candidate] = await db.select().from(matchCandidates).where(eq(matchCandidates.id, req.params.candidateId)).limit(1);
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });
    const [updated] = await db.update(matchCandidates).set({ status: parsed.data.status, reviewedBy: req.auth!.id, reviewedAt: new Date() })
      .where(eq(matchCandidates.id, candidate.id)).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "matching.candidate_reviewed", resourceType: "match_candidate", resourceId: candidate.id, outcome: "success", metadata: { status: parsed.data.status, notePresent: Boolean(parsed.data.note) } });
    res.json({ candidate: updated, notice: "Candidate review does not determine ownership. A separate claim review is required." });
  } catch (error) { next(error); }
});
