import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditEvents, financialJournals, financialPostings } from "../db/schema.js";
import { centsToKes, validateBalancedJournal, type JournalLineInput } from "../../shared/ledger-policy.js";

export type PostJournalInput = {
  sourceType: "collection" | "provider_fee" | "refund" | "reversal" | "settlement" | "period_close" | "correction";
  sourceId: string;
  idempotencyKey: string;
  memo: string;
  createdBy?: string | null;
  lines: readonly JournalLineInput[];
};

function canonicalLines(lines: readonly { accountCode: string; debitKes: string; creditKes: string; memo: string | null }[]) {
  return lines.map(line => JSON.stringify([line.accountCode, line.debitKes, line.creditKes, line.memo])).sort();
}

async function reuseExisting(idempotencyKey: string, input: PostJournalInput, expectedLines: ReturnType<typeof canonicalLines>) {
  const [existing] = await db.select().from(financialJournals)
    .where(eq(financialJournals.idempotencyKey, idempotencyKey)).limit(1);
  if (!existing) return null;
  const postings = await db.select().from(financialPostings).where(eq(financialPostings.journalId, existing.id));
  const actualLines = canonicalLines(postings.map(line => ({
    accountCode: line.accountCode,
    debitKes: line.debitKes,
    creditKes: line.creditKes,
    memo: line.memo,
  })));
  const sameHeader = existing.sourceType === input.sourceType && existing.sourceId === input.sourceId && existing.memo === input.memo && existing.currency === "KES";
  if (!sameHeader || JSON.stringify(actualLines) !== JSON.stringify(expectedLines)) {
    throw new Error("Idempotency key is already bound to a different financial journal payload");
  }
  return { journal: existing, reused: true as const };
}

/**
 * Posts an immutable, balanced KES journal and audit event in one transaction.
 * This service is intentionally not wired to provider collection, refunds or payouts;
 * those capabilities remain disabled until their independent gates are accepted.
 */
export async function postFinancialJournal(input: PostJournalInput) {
  const validated = validateBalancedJournal(input.lines);
  const expectedLines = canonicalLines(validated.lines.map(line => ({
    accountCode: line.accountCode,
    debitKes: centsToKes(line.debitCents),
    creditKes: centsToKes(line.creditCents),
    memo: line.memo,
  })));
  const existing = await reuseExisting(input.idempotencyKey, input, expectedLines);
  if (existing) return existing;

  try {
    return await db.transaction(async tx => {
      const [journal] = await tx.insert(financialJournals).values({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        currency: "KES",
        memo: input.memo,
        createdBy: input.createdBy ?? null,
      }).returning();
      await tx.insert(financialPostings).values(validated.lines.map(line => ({
        journalId: journal.id,
        accountCode: line.accountCode,
        debitKes: centsToKes(line.debitCents),
        creditKes: centsToKes(line.creditCents),
        memo: line.memo,
      })));
      await tx.insert(auditEvents).values({
        actorId: input.createdBy ?? null,
        action: "finance.ledger_journal_posted",
        resourceType: "financial_journal",
        resourceId: journal.id,
        outcome: "success",
        metadata: { sourceType: input.sourceType, sourceId: input.sourceId, currency: "KES", totalCents: validated.totalDebitCents, lineCount: validated.lines.length },
      });
      return { journal, reused: false };
    });
  } catch (error) {
    const raced = await reuseExisting(input.idempotencyKey, input, expectedLines);
    if (raced) return raced;
    throw error;
  }
}
