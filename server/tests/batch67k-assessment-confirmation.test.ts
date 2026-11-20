import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const financeSource = readFileSync(new URL("../routes/finance.ts", import.meta.url), "utf8");
const routeStart = financeSource.indexOf('financeRouter.post("/assessments/:assessmentId/confirm"');
const routeEnd = financeSource.indexOf('financeRouter.get("/reconciliation/matching-candidates"', routeStart);
const route = financeSource.slice(routeStart, routeEnd);

describe("Batch 67K claimant assessment confirmation", () => {
  it("keeps claimant consent, assessment update and audit in one transaction", () => {
    expect(routeStart).toBeGreaterThanOrEqual(0);
    expect(routeEnd).toBeGreaterThan(routeStart);
    expect(route).toContain("db.transaction(async tx =>");
    const update = route.indexOf("tx.update(paymentAssessments)");
    const audit = route.indexOf("tx.insert(auditEvents)");
    expect(update).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(update);
    expect(route).not.toContain("await db.insert(auditEvents)");
  });

  it("uses the report -> claim -> assignment -> assessment lock order", () => {
    const reportLock = route.indexOf('from(reports)');
    const claimLock = route.indexOf('const [claim] = await tx.select().from(claims)');
    const assignmentLock = route.indexOf('from(assignments)');
    const assessmentLock = route.indexOf('const [assessment] = await tx.select().from(paymentAssessments)');
    expect(reportLock).toBeGreaterThan(-1);
    expect(claimLock).toBeGreaterThan(reportLock);
    expect(assignmentLock).toBeGreaterThan(claimLock);
    expect(assessmentLock).toBeGreaterThan(assignmentLock);
    expect(route.slice(reportLock)).toContain('.for("update")');
    expect(route.slice(claimLock)).toContain('.for("update")');
    expect(route.slice(assignmentLock)).toContain('.for("update")');
    expect(route.slice(assessmentLock)).toContain('.for("update")');
  });

  it("rechecks claimant ownership and approved claim state inside the transaction", () => {
    expect(route).toContain("claim.claimantId !== req.auth!.id");
    expect(route).toContain('claim.status !== "approved"');
    expect(route).toContain('assessment.status !== "awaiting_claimant_confirmation"');
  });
});
