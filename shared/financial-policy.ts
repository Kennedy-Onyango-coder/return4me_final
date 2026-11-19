/**
 * Pure policy helpers only. These functions do not create transactions,
 * approve settlements, call IntaSend or move money.
 */
export const TARGET_SPLIT = Object.freeze({ finder: 33, agent: 25, platform: 42 });

export type Allocation = {
  grossCents: number;
  finderCents: number;
  agentCents: number;
  platformCents: number;
  percentages: typeof TARGET_SPLIT;
};

export function allocateGrossKes(grossKes: number): Allocation {
  if (!Number.isFinite(grossKes) || grossKes <= 0) throw new Error("Gross amount must be a positive finite KES amount");
  const grossCents = Math.round(grossKes * 100);
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0) throw new Error("Gross amount is outside the supported range");
  const finderCents = Math.round(grossCents * TARGET_SPLIT.finder / 100);
  const agentCents = Math.round(grossCents * TARGET_SPLIT.agent / 100);
  const platformCents = grossCents - finderCents - agentCents;
  if (platformCents < 0) throw new Error("Allocation rounding produced an invalid result");
  return { grossCents, finderCents, agentCents, platformCents, percentages: TARGET_SPLIT };
}

export function getSettlementEligibilityTime(recoveryConfirmedAt: Date): Date {
  if (!(recoveryConfirmedAt instanceof Date) || Number.isNaN(recoveryConfirmedAt.getTime())) throw new Error("A valid recovery confirmation time is required");
  return new Date(recoveryConfirmedAt.getTime() + 48 * 60 * 60 * 1000);
}

export type SettlementEligibilityInput = {
  paymentConfirmedAt: Date | null;
  recoveryConfirmedAt: Date | null;
  settleAt: Date | null;
  disputeHold: boolean;
  legalHold: boolean;
  now?: Date;
};

export type SettlementEligibility = { eligible: boolean; reason: string };

export function evaluateSettlementEligibility(input: SettlementEligibilityInput): SettlementEligibility {
  if (!input.paymentConfirmedAt) return { eligible: false, reason: "Required payment is not provider-confirmed" };
  if (!input.recoveryConfirmedAt) return { eligible: false, reason: "Recovery and handover are not confirmed" };
  if (input.disputeHold) return { eligible: false, reason: "A dispute is holding settlement" };
  if (input.legalHold) return { eligible: false, reason: "A legal hold is active" };
  if (!input.settleAt) return { eligible: false, reason: "Settlement eligibility time is not recorded" };
  if (input.settleAt.getTime() > (input.now ?? new Date()).getTime()) return { eligible: false, reason: "The 48-hour settlement period has not elapsed" };
  return { eligible: true, reason: "Eligible for settlement approval; payout initiation remains a separate manual action" };
}

export type PayoutPreflightInput = {
  settlementApproved: boolean;
  paymentProviderConfirmed: boolean;
  recoveryHandoverConfirmed: boolean;
  disputeHold: boolean;
  legalHold: boolean;
  beneficiaryVerified: boolean;
  destinationRecentlyChanged: boolean;
  sufficientWorkingWalletFunds: boolean;
  workingWalletVerifiedForDisbursement: boolean;
  payoutAlreadyExists: boolean;
  initiatorId: string;
  approverId: string | null;
};

export function evaluatePayoutPreflight(input: PayoutPreflightInput) {
  const blockers: string[] = [];
  if (!input.settlementApproved) blockers.push("Settlement is not approved");
  if (!input.paymentProviderConfirmed) blockers.push("Required payment is not provider-confirmed");
  if (!input.recoveryHandoverConfirmed) blockers.push("Recovery handover is not confirmed");
  if (input.disputeHold) blockers.push("A dispute hold is active");
  if (input.legalHold) blockers.push("A legal hold is active");
  if (!input.beneficiaryVerified) blockers.push("Beneficiary is not verified");
  if (input.destinationRecentlyChanged) blockers.push("Destination change hold is active");
  if (!input.sufficientWorkingWalletFunds) blockers.push("Verified working-wallet liquidity is insufficient");
  if (!input.workingWalletVerifiedForDisbursement) blockers.push("Disbursement wallet capability is not verified");
  if (input.payoutAlreadyExists) blockers.push("A payout request already exists");
  if (!input.approverId || input.approverId === input.initiatorId) blockers.push("Independent approval is required");
  return { allowed: blockers.length === 0, blockers };
}

export type ProviderOutcome = "confirmed_success" | "confirmed_failure" | "pending" | "timeout" | "malformed";
export function classifyPaymentRetry(outcome: ProviderOutcome) {
  if (outcome === "confirmed_failure") return { retryAllowed: true, instruction: "Retry only after confirming the provider's failure state and using a new idempotency key." };
  if (outcome === "pending" || outcome === "timeout" || outcome === "malformed") return { retryAllowed: false, instruction: "Keep the payment outcome pending/unknown and reconcile with the provider. Do not ask the payer to pay again." };
  return { retryAllowed: false, instruction: "The payment is confirmed. Do not initiate another collection." };
}

export function providerConfirmationIsAuthoritative(input: { authenticatedCallback: boolean; idempotencyVerified: boolean; providerStatus: string }) {
  return input.authenticatedCallback && input.idempotencyVerified && ["COMPLETE", "SUCCESS", "COMPLETED"].includes(input.providerStatus.toUpperCase());
}
