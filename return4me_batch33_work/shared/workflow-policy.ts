export type ClaimStatus = "submitted" | "under_review" | "approved" | "rejected" | "disputed" | "completed" | "cancelled";
export type CustodyEvent = "received" | "inspection_completed" | "handover_ready" | "released" | "custody_transfer";

const claimTransitions: Record<ClaimStatus, readonly ClaimStatus[]> = {
  submitted: ["under_review", "disputed", "cancelled"],
  under_review: ["approved", "rejected", "disputed", "cancelled"],
  approved: ["disputed", "completed", "cancelled"],
  rejected: ["disputed"],
  disputed: ["under_review", "rejected", "approved", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionClaim(from: ClaimStatus, to: ClaimStatus) {
  return claimTransitions[from].includes(to);
}

/** Facts already read from the custody event trail for the report/agent pair. */
export type CustodyEventHistory = {
  hasReceived: boolean;
  hasInspected: boolean;
  hasHandoverReady: boolean;
};

export type CustodyOrderingDecision = { allowed: true } | { allowed: false; message: string };

/**
 * Approved Agent custody ordering (docs/API.md "Agents, assignments and custody"):
 * physical receipt -> inspection -> handover-ready -> release.
 *
 * This is the single enforcement point used by `POST /agents/custody-events`. It is pure so the
 * ordering can be regression tested without a database, and it deliberately covers
 * `handover_ready` so the "inspection before handover" rule can never become unreachable
 * dead code behind an earlier gate.
 */
export function custodyEventOrderingDecision(history: CustodyEventHistory, next: CustodyEvent): CustodyOrderingDecision {
  if (next === "received" && history.hasReceived) {
    return { allowed: false, message: "Receipt has already been recorded" };
  }
  if (next === "inspection_completed" && !history.hasReceived) {
    return { allowed: false, message: "Record physical receipt before inspection" };
  }
  if (next === "handover_ready" && !history.hasInspected) {
    return { allowed: false, message: "Complete and record inspection before marking handover ready" };
  }
  if (next === "handover_ready" && history.hasHandoverReady) {
    return { allowed: false, message: "Handover readiness has already been recorded" };
  }
  if (next === "released" && !history.hasHandoverReady) {
    return { allowed: false, message: "Record verified handover readiness before release" };
  }
  return { allowed: true };
}

export function canRecordCustodyEvent(prior: readonly CustodyEvent[], next: CustodyEvent, hasVerifiedAuthorisedAgent: boolean, handoverGatesPassed = false) {
  if (!hasVerifiedAuthorisedAgent) return false;
  if (next === "received") return !prior.includes("received");
  if (next === "inspection_completed") return prior.includes("received") && !prior.includes("inspection_completed");
  // Handover-ready and release require separate live payment, identity, hold and dual-confirmation gates.
  if (next === "handover_ready") return handoverGatesPassed && prior.includes("inspection_completed") && !prior.includes("handover_ready");
  if (next === "released") return handoverGatesPassed && prior.includes("handover_ready");
  return false;
}

export function canReleaseItem(input: {
  claimApproved: boolean;
  paymentConfirmed: boolean;
  collectionCodeConsumed: boolean;
  claimantIdentityVerified: boolean;
  authorisedAgent: boolean;
  disputeOrLegalHold: boolean;
  handoverConfirmedByBoth: boolean;
}) {
  return input.claimApproved && input.paymentConfirmed && input.collectionCodeConsumed && input.claimantIdentityVerified && input.authorisedAgent && !input.disputeOrLegalHold && input.handoverConfirmedByBoth;
}
