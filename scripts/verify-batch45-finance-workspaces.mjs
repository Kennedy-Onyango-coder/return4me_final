import { readFileSync } from 'node:fs';
const finance=readFileSync(new URL('../server/routes/finance.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const blocks={
  payments:finance.split('financeRouter.get("/payment-transactions"')[1]?.split('financeRouter.get("/payment-transactions/:id"')[0]??'',
  settlements:finance.split('financeRouter.get("/settlements"')[1]?.split('financeRouter.get("/settlements/:id"')[0]??'',
  reconciliation:finance.split('financeRouter.get("/reconciliation/collections"')[1]?.split('financeRouter.get("/reconciliation/collections/:id"')[0]??'',
  refunds:finance.split('financeRouter.get("/refund-requests"')[1]?.split('financeRouter.get("/refund-requests/:id"')[0]??'',
  payouts:finance.split('financeRouter.get("/payout-requests"')[1]?.split('financeRouter.get("/payout-requests/:id"')[0]??'',
  destinations:finance.split('financeRouter.get("/payout-destinations/pending"')[1]?.split('financeRouter.get("/payout-destinations/:id/admin-detail"')[0]??'',
  rewards:finance.split('financeRouter.get("/reward-authorizations"')[1]?.split('financeRouter.get("/reward-authorizations/:id"')[0]??''
};
const checks=[
 ['payment queue is Admin/Owner only',/financeRouter\.get\("\/payment-transactions",\s*requireRole\("admin",\s*"owner"\)/.test(finance)],
 ['payment queue omits payer phone and provider references',!!blocks.payments.length&&!/payerPhone|providerReference|providerReceipt|payerPhoneCiphertext/.test(blocks.payments)],
 ['settlement queue omits beneficiary allocations',!!blocks.settlements.length&&!/finderUserId|agentUserId|finderKes|agentKes|platformKes/.test(blocks.settlements)],
 ['reconciliation queue omits provider references and notes',!!blocks.reconciliation.length&&!/externalReference|internalReference|resolutionNote|evidenceRef|reviewedBy/.test(blocks.reconciliation)],
 ['refund queue omits reasons and provider evidence',!!blocks.refunds.length&&!/reason:|destinationFingerprint|providerBatchId|providerTransactionId|reconciliationNote|reconciliationEvidenceRef/.test(blocks.refunds)],
 ['payout queue omits beneficiary and provider identifiers',!!blocks.payouts.length&&!/beneficiaryUserId|destinationFingerprint|createdBy|approvedBy|executedBy|providerBatchId|providerTransactionId/.test(blocks.payouts)],
 ['pending destination queue omits beneficiary and phone',!!blocks.destinations.length&&!/userId|phoneMasked|phoneCiphertext|fingerprint/.test(blocks.destinations)],
 ['reward authorization queue omits funding evidence',!!blocks.rewards.length&&!/fundingSource|sourceReference|evidenceRef|createdBy|verifiedBy/.test(blocks.rewards)],
 ['restricted detail routes are Admin/Owner protected',[
  /financeRouter\.get\("\/payment-transactions\/:id",\s*requireRole\("admin",\s*"owner"\)/,
  /financeRouter\.get\("\/settlements\/:id",\s*requireRole\("admin",\s*"owner"\)/,
  /financeRouter\.get\("\/refund-requests\/:id",\s*requireRole\("admin",\s*"owner"\)/,
  /financeRouter\.get\("\/payout-requests\/:id",\s*requireRole\("admin",\s*"owner"\)/,
  /financeRouter\.get\("\/reconciliation\/collections\/:id",\s*requireRole\("admin",\s*"owner"\)/,
  /financeRouter\.get\("\/reward-authorizations\/:id",\s*requireRole\("admin",\s*"owner"\)/,
  /financeRouter\.get\("\/payout-destinations\/:id\/admin-detail",\s*requireRole\("admin",\s*"owner"\)/
 ].every(r=>r.test(finance))],
 ['each restricted financial detail endpoint writes an access audit event',[
  'finance.payment_detail_viewed','finance.settlement_detail_viewed','finance.reconciliation_detail_viewed',
  'finance.refund_detail_viewed','finance.payout_detail_viewed','finance.reward_authorization_detail_viewed','finance.payout_destination_detail_viewed'
 ].every(a=>finance.includes(`action: "${a}"`))],
 ['payout destination detail never returns ciphertext',/payout-destinations\/:id\/admin-detail[\s\S]*?phoneMasked:[\s\S]*?evidenceRef:[\s\S]*?ciphertextExposed: false/.test(finance)&&!(/payout-destinations\/:id\/admin-detail[\s\S]*?phoneCiphertext:/.test(finance))],
 ['Finance UI opens details only on explicit selection',/openFinanceDetail\("payment"/.test(ui)&&/openFinanceDetail\("refund"/.test(ui)&&/openFinanceDetail\("payoutRequest"/.test(ui)&&/Restricted financial detail/.test(ui)],
 ['Finance UI no longer displays restricted beneficiary/allocation metadata in queues',/Allocation breakdown restricted to audited detail view/.test(ui)&&/Beneficiary and provider evidence restricted/.test(ui)&&/Beneficiary and masked number restricted/.test(ui)],
 ['provider execution remains separate from detail access',/Payout initiation is disabled|livePayoutEnabled: false/.test(finance)]
];
let failed=0;for(const [name,pass] of checks){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(!pass)failed++;}
if(failed)process.exitCode=1;else console.log(`Batch 45 finance governance guard passed (${checks.length} checks). Static source guard only.`);
