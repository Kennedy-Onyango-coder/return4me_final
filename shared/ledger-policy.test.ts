import { describe, expect, it } from "vitest";
import { centsToKes, claimantCollectionJournalLines, correctionJournalSource, validateBalancedJournal } from "./ledger-policy.js";

describe("double-entry ledger policy", () => {
  it("accepts balanced integer-cent KES journals", () => {
    const journal = validateBalancedJournal([
      { accountCode: "CASH.INTASEND", debitCents: 12500 },
      { accountCode: "LIABILITY.CLAIMANT", creditCents: 12500 },
    ]);
    expect(journal.totalDebitCents).toBe(12500);
    expect(journal.currency).toBe("KES");
    expect(centsToKes(12500)).toBe("125.00");
  });
  it("rejects imbalance, zero lines, fractional cents and dual-sided lines", () => {
    expect(() => validateBalancedJournal([{ accountCode: "CASH", debitCents: 100 }, { accountCode: "LIABILITY", creditCents: 99 }])).toThrow(/balance/);
    expect(() => validateBalancedJournal([{ accountCode: "CASH", debitCents: 0 }, { accountCode: "LIABILITY", creditCents: 0 }])).toThrow(/positive/);
    expect(() => validateBalancedJournal([{ accountCode: "CASH", debitCents: 1.5 }, { accountCode: "LIABILITY", creditCents: 1.5 }])).toThrow(/integer-cent/);
    expect(() => validateBalancedJournal([{ accountCode: "CASH", debitCents: 100, creditCents: 100 }, { accountCode: "LIABILITY", creditCents: 100 }])).toThrow(/Exactly one/);
  });
  it("books claimant recovery-service collections to an unclassified liability, not revenue", () => {
    const journal = claimantCollectionJournalLines("250.50");
    expect(journal.totalDebitCents).toBe(25050);
    expect(journal.lines[0].accountCode).toBe("PROVIDER_COLLECTION_CLEARING");
    expect(journal.lines[1].accountCode).toBe("UNCLASSIFIED_COLLECTIONS_LIABILITY");
    expect(() => claimantCollectionJournalLines("0")).toThrow();
    expect(() => claimantCollectionJournalLines("250.501")).toThrow();
  });
  it("requires a correcting journal rather than rewriting history", () => {
    expect(correctionJournalSource("00000000-0000-4000-8000-000000000001").requiresNewJournal).toBe(true);
    expect(() => correctionJournalSource("not-an-id")).toThrow();
  });
});
