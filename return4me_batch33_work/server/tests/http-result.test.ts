import { describe, expect, it } from "vitest";
import { fail, isRouteFailure, succeed, type RouteResult } from "../http-result.js";

/**
 * Mirrors `db.transaction<T>()`. The Batch 4 type errors only appeared when the success and
 * failure object literals were returned through this generic inference path, so the guards below
 * are exercised the same way the routes exercise them.
 */
async function transactionLike<T>(work: () => Promise<T>): Promise<T> {
  return work();
}

/** Compile-time guard: accepts only a real `number`, never `string | undefined`. */
const asNumericStatus = (value: number): number => value;

describe("typed route results", () => {
  it("keeps the error message in its own field, separate from the status", () => {
    const result = fail(404, "Report not found");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toBe("Report not found");
    expect(result.error).not.toBe(String(result.status));
  });

  it("narrows a transaction-shaped union to a numeric failure status", async () => {
    const missing = true;
    const result = await transactionLike(async () =>
      missing ? fail(404, "Report not found") : succeed({ assignment: { id: "assignment-1" } })
    );
    if (!isRouteFailure(result)) throw new Error("expected a failure result");
    // `asNumericStatus` only compiles once the failure member has been narrowed, which is what
    // makes `res.status(result.status)` type-safe instead of `number | undefined`.
    expect(asNumericStatus(result.status)).toBe(404);
    expect(result.status).not.toBeUndefined();
    expect(typeof result.error).toBe("string");
  });

  it("narrows a transaction-shaped union to the success payload", async () => {
    const missing = false;
    const result = await transactionLike(async () =>
      missing ? fail(404, "Report not found") : succeed({ assignment: { id: "assignment-1" } })
    );
    if (isRouteFailure(result)) throw new Error("expected a success result");
    expect(result.value.assignment.id).toBe("assignment-1");
  });

  it("separates a payload status string from the numeric HTTP status", async () => {
    // Pricing review payloads carry their own `status` field. Before the discriminated union this
    // collapsed to `string | number` and `res.status(result.status)` stopped compiling.
    const approved = false;
    const result = await transactionLike(async () =>
      approved
        ? succeed({ reviewed: true as const, status: "approved" as const, permanentCategoryCreated: false })
        : fail(400, "A permanent category can only be created when the proposal is approved")
    );
    if (!isRouteFailure(result)) throw new Error("expected a failure result");
    expect(asNumericStatus(result.status)).toBe(400);
    expect(result.error).toBe("A permanent category can only be created when the proposal is approved");
  });

  it("returns the payload status string on the success branch", async () => {
    const approved = true;
    const result = await transactionLike(async () =>
      approved
        ? succeed({ reviewed: true as const, status: "approved" as const, permanentCategoryCreated: true })
        : fail(400, "A permanent category can only be created when the proposal is approved")
    );
    if (isRouteFailure(result)) throw new Error("expected a success result");
    expect(result.value.status).toBe("approved");
    expect(result.value.permanentCategoryCreated).toBe(true);
  });

  it("treats both members as exhaustive", () => {
    const describeResult = (result: RouteResult<{ id: string }>): string =>
      isRouteFailure(result) ? `${result.status}: ${result.error}` : result.value.id;
    expect(describeResult(succeed({ id: "proposal-1" }))).toBe("proposal-1");
    expect(describeResult(fail(409, "Already reviewed"))).toBe("409: Already reviewed");
  });

  it("does not accept a message where a numeric status is required", () => {
    // @ts-expect-error an error message is not an HTTP status
    const broken = fail("Not found", "Report not found");
    expect(broken.error).toBe("Report not found");
  });
});
