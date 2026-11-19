import fs from 'node:fs';
import path from 'node:path';

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

const rows = parseCsv(fs.readFileSync('docs/REQUIREMENT_TRACEABILITY.csv', 'utf8'));
const header = rows.shift();
const idx = Object.fromEntries(header.map((name, i) => [name, i]));
const ids = rows.map(row => row[idx.requirement_id]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const errors = [];
for (const [n, row] of rows.entries()) {
  const id = row[idx.requirement_id];
  const status = row[idx.current_source_status];
  const sourcePaths = (row[idx.implementation_paths] ?? '').split(';').map(value => value.trim()).filter(Boolean);
  const testPaths = (row[idx.test_paths] ?? '').split(';').map(value => value.trim()).filter(Boolean);
  if (!id || !sourcePaths.length || !['NOT_STARTED', 'PARTIAL', 'IMPLEMENTED_UNVERIFIED', 'VERIFIED_COMPLETE', 'BLOCKED'].includes(status)) errors.push(`row ${n + 2}: invalid identity, source path or status`);
  for (const candidate of sourcePaths) if (!fs.existsSync(candidate)) errors.push(`${id}: implementation path does not exist: ${candidate}`);
  for (const candidate of testPaths) {
    if (candidate.includes('*')) errors.push(`${id}: wildcard test path is not an exact evidence mapping: ${candidate}`);
    else if (!fs.existsSync(candidate)) errors.push(`${id}: test path does not exist: ${candidate}`);
  }
}
if (rows.length !== 166 || duplicates.length || errors.length) {
  process.stderr.write(`Traceability validation failed: rows=${rows.length}, duplicate IDs=${duplicates.length}, errors=${errors.length}\n${errors.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Traceability check passed: ${rows.length} unique requirement IDs; every cited source and candidate test path exists. Candidate test paths are not proof of requirement coverage.\n`);
