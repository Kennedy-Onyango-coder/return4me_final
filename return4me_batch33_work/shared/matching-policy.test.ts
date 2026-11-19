import { describe, expect, it } from "vitest";
import { evaluatePotentialMatch, matchingIsOwnershipProof } from "./matching-policy";
import { canRecordCustodyEvent, canReleaseItem, canTransitionClaim } from "./workflow-policy";

const lost = { id: "1", reference: "L1", category: "Electronics", county: "Nairobi", itemDescription: "Black smartphone with cracked screen", privateMetadata: { approvedMatchRule: true, approvedMatchKey: "IMEI ending 1234", subcategory: "Mobile phone" } };
const found = { id: "2", reference: "F1", category: "Electronics", county: "Nairobi", itemDescription: "Black phone, cracked screen", privateMetadata: { approvedMatchRule: true, approvedMatchKey: "IMEI ending 1234", subcategory: "Mobile phone" } };

describe("matching review policy", () => {
  it("prioritises identical approved item rules", () => expect(evaluatePotentialMatch(lost, found)?.tier).toBe("exact_approved_rule"));
  it("uses subcategory before category", () => expect(evaluatePotentialMatch({ ...lost, privateMetadata: { subcategory: "Mobile phone" } }, { ...found, privateMetadata: { subcategory: "Mobile phone" } })?.tier).toBe("subcategory"));
  it("does not create a category match across categories", () => expect(evaluatePotentialMatch(lost, { ...found, category: "Documents and identity" })).toBeNull());
  it("never treats matching as ownership proof", () => expect(matchingIsOwnershipProof()).toBe(false));
});

describe("claim and custody workflow guards", () => {
  it("does not allow skipping claim review", () => expect(canTransitionClaim("submitted", "approved")).toBe(false));
  it("requires a received event before inspection", () => expect(canRecordCustodyEvent([], "inspection_completed", true)).toBe(false));
  it("does not release on handover readiness alone", () => expect(canRecordCustodyEvent(["received", "inspection_completed", "handover_ready"], "released", true)).toBe(false));
  it("requires every independent release gate", () => expect(canReleaseItem({ claimApproved: true, paymentConfirmed: true, collectionCodeConsumed: true, claimantIdentityVerified: true, authorisedAgent: true, disputeOrLegalHold: false, handoverConfirmedByBoth: true })).toBe(true));
  it("blocks release during a dispute hold", () => expect(canReleaseItem({ claimApproved: true, paymentConfirmed: true, collectionCodeConsumed: true, claimantIdentityVerified: true, authorisedAgent: true, disputeOrLegalHold: true, handoverConfirmedByBoth: true })).toBe(false));
});
