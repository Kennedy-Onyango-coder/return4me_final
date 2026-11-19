import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, "server/db/migrations/0003_financial_journal.sql"), "utf8");
const service = readFileSync(resolve(root, "server/services/ledger.ts"), "utf8");

describe("immutable financial journal foundation", () => {
  it("requires balanced journals at transaction commit", () => {
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(migration).toContain("debit_total <> credit_total");
    expect(migration).toContain("line_count < 2");
  });
  it("prevents adding postings after the journal-creation transaction", () => {
    expect(migration).toContain("journal_txid <> txid_current()");
    expect(migration).toContain("Postings must be inserted in the same transaction");
  });
  it("protects journals and postings from mutation and truncation", () => {
    expect(migration).toContain("financial_journals_no_mutation");
    expect(migration).toContain("financial_journals_no_truncate");
    expect(migration).toContain("financial_postings_no_mutation");
    expect(migration).toContain("financial_postings_no_truncate");
  });
  it("checks an idempotency replay against the original payload and audits a new journal", () => {
    expect(service).toContain("Idempotency key is already bound to a different financial journal payload");
    expect(service).toContain("finance.ledger_journal_posted");
  });
});
