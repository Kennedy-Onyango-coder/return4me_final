import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ignored = new Set(["node_modules", "dist", "dist-server", "coverage"]);
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) walk(path.join(directory, entry.name));
    } else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path.join(directory, entry.name));
  }
}
walk(process.cwd());
const errors = [];
for (const file of files) {
  const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  });
  for (const diagnostic of result.diagnostics ?? []) {
    errors.push(`${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
  }
}
if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Source syntax check passed: ${files.length} TypeScript/TSX files, zero syntax diagnostics. This is not a typecheck or runtime acceptance.\n`);
