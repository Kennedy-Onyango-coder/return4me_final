import fs from 'node:fs';

function parseCsv(source) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const parsed = parseCsv(fs.readFileSync('docs/REQUIREMENT_EVIDENCE_MATRIX.csv', 'utf8'));
const header = parsed.shift();
const index = Object.fromEntries(header.map((name, i) => [name, i]));
const rows = parsed.filter(row => row.some(Boolean));
const ids = rows.map(row => row[index.requirement_id]);
const traceabilityIds = parseCsv(fs.readFileSync('docs/REQUIREMENT_TRACEABILITY.csv', 'utf8')).slice(1).map(row => row[0]);
const errors = [];
if (ids.length !== traceabilityIds.length || ids.some((id, i) => id !== traceabilityIds[i])) errors.push('evidence and traceability requirement IDs/order differ');
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
const allowed = {
  specification_status: ['APPROVED', 'DRAFT', 'CONFLICTED', 'PROVENANCE_PENDING'],
  implementation_status: ['NOT_STARTED', 'PARTIAL', 'IMPLEMENTED_UNVERIFIED', 'VERIFIED_COMPLETE', 'BLOCKED'],
  technical_verification: ['NOT_RUN', 'PASSED', 'FAILED', 'BLOCKED'],
  independent_acceptance: ['PENDING', 'ACCEPTED', 'REJECTED', 'DEFERRED'],
  release_authorisation: ['NOT_AUTHORISED', 'CONDITIONALLY_AUTHORISED', 'AUTHORISED'],
};
for (const [dimension, values] of Object.entries(allowed)) {
  for (const [n, row] of rows.entries()) {
    if (!values.includes(row[index[dimension]])) errors.push(`row ${n + 2}: invalid ${dimension}`);
  }
}
for (const [n, row] of rows.entries()) {
  const get = key => row[index[key]] ?? '';
  if (!get('requirement_id') || !get('requirement_text') || !get('source_paths')) errors.push(`row ${n + 2}: missing requirement identity/source`);
  if (get('implementation_status') === 'VERIFIED_COMPLETE') {
    if (get('technical_verification') !== 'PASSED' || get('independent_acceptance') !== 'ACCEPTED' || !get('mapped_test_names') || !get('execution_evidence_ref') || !get('reviewer') || !get('acceptance_date')) {
      errors.push(`row ${n + 2}: VERIFIED_COMPLETE lacks technical, test, evidence or independent acceptance proof`);
    }
  }
  if (get('release_authorisation') === 'AUTHORISED' && get('independent_acceptance') !== 'ACCEPTED') errors.push(`row ${n + 2}: release authorised without independent acceptance`);
}
if (rows.length < 166 || new Set(ids).size !== ids.length || duplicates.length || errors.length) {
  process.stderr.write(`Evidence matrix validation failed: rows=${rows.length}, unique=${new Set(ids).size}, errors=${errors.length}\n${errors.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Evidence matrix validation passed: ${rows.length} requirement rows; independent acceptance and release evidence remain explicit.\n`);
