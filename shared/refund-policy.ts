export type RefundStatus = "requested" | "approved" | "submitting" | "unknown" | "rejected" | "refunded";

export function canRequestOriginalPayerRefund(input: {
  paymentConfirmed: boolean;
  claimCompleted: boolean;
  originalPayerFingerprintAvailable: boolean;
  activeRefundExists: boolean;
}): boolean {
  return input.paymentConfirmed && !input.claimCompleted && input.originalPayerFingerprintAvailable && !input.activeRefundExists;
}

export function canApproveRefund(requestedBy: string, approverId: string, status: string, isOwner = false): boolean {
  return status === "requested" && (isOwner || requestedBy !== approverId);
}

export function canExecuteRefund(input: { status: string; requestedBy: string; approvedBy: string | null; executorId: string }): boolean {
  return input.status === "approved" && input.executorId !== input.requestedBy && !!input.approvedBy && input.executorId !== input.approvedBy;
}

/** Initiation is never finality: even HTTP 2xx is unknown until separate evidence proves refund completion. */
export function classifyRefundInitiation(input: { httpStatus: number | null; responseJsonValid: boolean }): "unknown" | "rejected" {
  if (input.httpStatus === null || input.httpStatus === 408 || input.httpStatus === 429 || input.httpStatus >= 500 || (input.httpStatus >= 200 && input.httpStatus < 300) || !input.responseJsonValid) return "unknown";
  return "rejected";
}
