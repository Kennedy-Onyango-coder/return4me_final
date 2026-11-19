import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readCsv = (relative) => {
  const raw = fs.readFileSync(path.join(root, relative), "utf8").trimEnd();
  const lines = raw.split(/\r?\n/);
  const parse = (line) => {
    const cells = []; let value = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { cells.push(value); value = ""; }
      else value += ch;
    }
    if (quoted) throw new Error(`${relative}: unterminated CSV quote`);
    cells.push(value); return cells;
  };
  const headers = parse(lines[0]);
  return lines.slice(1).filter(Boolean).map((line, index) => {
    const values = parse(line);
    if (values.length !== headers.length) throw new Error(`${relative}:${index + 2}: expected ${headers.length} cells, got ${values.length}`);
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
};
const unique = (rows, key, label) => {
  const seen = new Set();
  for (const row of rows) {
    if (!row[key]) throw new Error(`${label}: empty ${key}`);
    if (seen.has(row[key])) throw new Error(`${label}: duplicate ${key} ${row[key]}`);
    seen.add(row[key]);
  }
};
const trace = readCsv("docs/REQUIREMENT_TRACEABILITY.csv");
const evidence = readCsv("docs/REQUIREMENT_EVIDENCE_MATRIX.csv");
const decisions = readCsv("docs/ACCEPTANCE_DECISIONS.csv");
const evidenceRegister = readCsv("docs/GOVERNANCE_EVIDENCE_REGISTER.csv");
const changes = readCsv("docs/CHANGE_CONTROL_REGISTER.csv");
const exceptions = readCsv("docs/RELEASE_EXCEPTIONS.csv");
unique(trace, "requirement_id", "traceability");
unique(evidence, "requirement_id", "evidence matrix");
unique(decisions, "decision_id", "acceptance decisions");
unique(evidenceRegister, "evidence_id", "evidence register");
unique(changes, "change_id", "change control");
const ids = (rows) => new Set(rows.map((r) => r.requirement_id));
const a = ids(trace), b = ids(evidence);
const missing = [...b].filter((id) => !a.has(id));
const extra = [...a].filter((id) => !b.has(id));
if (missing.length || extra.length) throw new Error(`Requirement ID mismatch: missing traceability=${missing.join(";")}; extra traceability=${extra.join(";")}`);
for (const row of evidence) {
  if (row.independent_acceptance === "ACCEPTED" && (!row.reviewer || !row.acceptance_date || !row.execution_evidence_ref || !/^[a-f0-9]{64}$/i.test(row.reviewed_source_sha256 ?? ""))) {
    throw new Error(`${row.requirement_id}: ACCEPTED requires reviewer, date, execution evidence and reviewed source SHA-256`);
  }
  if (row.release_authorisation === "AUTHORISED" && row.independent_acceptance !== "ACCEPTED") {
    throw new Error(`${row.requirement_id}: release cannot be authorised without independent acceptance`);
  }
}
for (const row of decisions) {
  if (row.decision === "ACCEPTED" && (!row.reviewer_name || !row.reviewer_role || !row.reviewed_at_utc || !/^[a-f0-9]{64}$/i.test(row.reviewed_source_sha256 ?? "") || !row.evidence_ids)) {
    throw new Error(`${row.decision_id}: ACCEPTED decision lacks reviewer, date, source hash or evidence`);
  }
}
for (const row of exceptions) {
  if (row.status === "APPROVED" && (!row.independent_reviewer || !row.owner_decision || !row.expiry_at_utc || !row.compensating_controls)) {
    throw new Error(`${row.exception_id}: approved exception lacks independent review, Owner decision, expiry or controls`);
  }
}
console.log(`Governance registers structurally consistent: ${trace.length} requirements; ${evidenceRegister.length} evidence records; ${decisions.length} pending/recorded decisions; ${changes.length} change controls.`);
