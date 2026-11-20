import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const routes = readFileSync("server/routes/agent-operations.ts", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const migration = readFileSync("server/db/migrations/0001_batch5_agent_custody.sql", "utf8");
describe("Batch 67J appointment lifecycle source contract", () => {
  it("expires only overdue unconfirmed requests using the existing cancelled status", () => {
    expect(routes).toContain("p.status='requested' AND p.ends_at<=now()");
    expect(routes).toContain("WHERE claimant_id=$1 AND status='requested' AND ends_at<=now()");
    expect(routes).toContain("claim.collection_appointment_request_expired");
    expect(migration).not.toMatch(/status IN \([^)]*'expired'/);
  });
  it("allows claimant or current Agent cancellation and invalidates the exact collection authorisation", () => {
    const cancel = routes.slice(routes.indexOf('patch("/appointments/:id/cancel"'), routes.indexOf('post("/appointments/:id/no-show"'));
    expect(cancel).toContain('requireRole("claimant", "agent")');
    expect(cancel).toContain("x.status='assigned'");
    expect(cancel).toContain("purpose='claimant_collection'");
    expect(cancel).toContain("consumed_at=now()");
    expect(cancel).toContain("collection_appointment_cancelled");
  });
  it("restricts manual no-show to the current verified Agent after the confirmed end", () => {
    const noShow = routes.slice(routes.indexOf('post("/appointments/:id/no-show"'), routes.indexOf("// Admin records an in-person"));
    expect(noShow).toContain('requireRole("agent")');
    expect(noShow).toContain('appointment.rows[0].status !== "confirmed"');
    expect(noShow).toContain("new Date(appointment.rows[0].ends_at) > new Date()");
    expect(noShow).toContain("assignment.rows[0].user_id !== req.auth!.id");
    expect(noShow).toContain("manuallyRecorded: true");
    expect((routes.match(/SET status='no_show'/g) || []).length).toBe(1);
  });
  it("requires a fresh request after cancellation and exposes outcomes in both workspaces", () => {
    expect(routes).toContain("Cancel the current appointment before requesting a new time");
    expect(app).toContain("Latest appointment:");
    expect(app).toContain("Record no-show");
    expect(app).toContain("Cancel appointment");
    expect(app).toContain("appointment_id:string|null");
  });
});
