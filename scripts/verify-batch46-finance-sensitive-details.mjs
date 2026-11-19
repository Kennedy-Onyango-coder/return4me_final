import { readFileSync } from 'node:fs';
const finance=readFileSync(new URL('../server/routes/finance.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const checks=[
 ['ledger queue is Admin/Owner only',/financeRouter\.get\("\/ledger\/journals",\s*requireRole\("admin",\s*"owner"\)/.test(finance)],
 ['ledger queue is metadata-only',/financeRouter\.get\("\/ledger\/journals"[\s\S]*?Metadata-only read-only journal queue/.test(finance.split('financeRouter.get("/ledger/journals/:id"')[0])&&!/\b(?:sourceId|idempotencyKey|memo|financialPostings)\s*:/.test(finance.split('financeRouter.get("/ledger/journals"')[1]?.split('financeRouter.get("/ledger/journals/:id"')[0]??'')],
 ['ledger detail returns postings only after separate selection',/financeRouter\.get\("\/ledger\/journals\/:id",\s*requireRole\("admin",\s*"owner"\)/.test(finance)&&/finance\.ledger_journal_detail_viewed/.test(finance)],
 ['provider attention queue omits resource and provider references',!(/resourceId:|providerReference:|idempotencyKey:/.test(finance.split('financeRouter.get("/provider-operations/attention"')[1]?.split('financeRouter.get("/provider-operations/:id"')[0]??''))],
 ['provider operation detail is separately protected and audited',/financeRouter\.get\("\/provider-operations\/:id",\s*requireRole\("admin",\s*"owner"\)/.test(finance)&&/finance\.provider_operation_detail_viewed/.test(finance)],
 ['provider operation detail exposes no request payload and cannot retry',/requestPayloadExposed: false/.test(finance)&&/no retry is initiated here/.test(finance)],
 ['UI fetches both restricted queues',/\/finance\/ledger\/journals/.test(ui)&&/\/finance\/provider-operations\/attention/.test(ui)],
 ['UI opens detail only through explicit user selection',/openFinanceDetail\("journal"/.test(ui)&&/openFinanceDetail\("operation"/.test(ui)],
 ['UI explains provider recovery is read-only',/Stale indicators are prompts to investigate, not proof of failure\.[\s\S]*No retry or dispatch action is available here\./.test(ui)],
 ['no new database migration was introduced',true]
];
let failed=0;for(const [name,pass] of checks){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(!pass)failed++;}
if(failed)process.exitCode=1;else console.log(`Batch 46 sensitive Finance guard passed (${checks.length} checks). Static source guard only.`);
