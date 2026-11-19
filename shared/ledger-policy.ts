export type JournalLineInput = {
  accountCode: string;
  debitCents?: number;
  creditCents?: number;
  memo?: string;
};

export type ValidatedJournal = {
  currency: "KES";
  totalDebitCents: number;
  totalCreditCents: number;
  lines: Array<{ accountCode: string; debitCents: number; creditCents: number; memo: string | null }>;
};

/** Pure double-entry validation. It never posts a journal or moves money. */
export function validateBalancedJournal(lines: readonly JournalLineInput[]): ValidatedJournal {
  if (lines.length < 2) throw new Error("A journal requires at least two posting lines");
  const normalised = lines.map((line, index) => {
    const accountCode = line.accountCode.trim();
    const debitCents = line.debitCents ?? 0;
    const creditCents = line.creditCents ?? 0;
    if (!/^[A-Z0-9][A-Z0-9_.-]{1,59}$/.test(accountCode)) throw new Error(`Invalid account code on line ${index + 1}`);
    if (!Number.isSafeInteger(debitCents) || !Number.isSafeInteger(creditCents) || debitCents < 0 || creditCents < 0) throw new Error(`Invalid integer-cent amount on line ${index + 1}`);
    if ((debitCents > 0) === (creditCents > 0)) throw new Error(`Exactly one positive debit or credit is required on line ${index + 1}`);
    return { accountCode, debitCents, creditCents, memo: line.memo?.trim() || null };
  });
  const totalDebitCents = normalised.reduce((sum, line) => sum + line.debitCents, 0);
  const totalCreditCents = normalised.reduce((sum, line) => sum + line.creditCents, 0);
  if (!Number.isSafeInteger(totalDebitCents) || !Number.isSafeInteger(totalCreditCents) || totalDebitCents <= 0 || totalDebitCents !== totalCreditCents) {
    throw new Error("Journal debits and credits must balance to the same positive KES amount");
  }
  return { currency: "KES", totalDebitCents, totalCreditCents, lines: normalised };
}

export function centsToKes(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Amount must be a non-negative integer number of cents");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function correctionJournalSource(originalJournalId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(originalJournalId)) throw new Error("A valid original journal ID is required");
  return { sourceType: "correction" as const, sourceId: originalJournalId, requiresNewJournal: true as const };
}

/**
 * Conservative double-entry treatment for a confirmed claimant recovery-service
 * collection. It remains an unclassified liability pending qualified accounting
 * review; it is deliberately not recognised as platform revenue or reward income.
 */
export function claimantCollectionJournalLines(amountKes: string | number): ValidatedJournal {
  const raw = typeof amountKes === "number" ? amountKes.toFixed(2) : amountKes.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) throw new Error("Collection amount must be a positive KES amount with at most two decimal places");
  const [whole, fraction = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("Collection amount must be positive and within the supported range");
  return validateBalancedJournal([
    { accountCode: "PROVIDER_COLLECTION_CLEARING", debitCents: cents, memo: "Provider-confirmed KES collection" },
    { accountCode: "UNCLASSIFIED_COLLECTIONS_LIABILITY", creditCents: cents, memo: "Claimant recovery-service charge; not classified as revenue" },
  ]);
}
