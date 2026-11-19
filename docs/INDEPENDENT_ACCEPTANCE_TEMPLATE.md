# Independent acceptance record template

> The implementation author must not mark their own work independently accepted. Use one record per requirement or tightly bounded review scope.

- Review ID:
- Requirement IDs / scope:
- Source archive / commit / SHA-256:
- Reviewer name and organisation:
- Reviewer independence declaration:
- Reviewer qualifications / relevant scope:
- Review date and environment:
- Requirements reviewed:
- Source paths and migration IDs inspected:
- Test names and exact commands executed:
- Execution result, exit code and log reference/hash:
- Positive cases:
- Negative / abuse / cross-tenant cases:
- Concurrency / failure / recovery cases:
- Browser / accessibility cases, where applicable:
- External sandbox evidence, where applicable:
- Findings and severity:
- Remediation required:
- Residual risks and explicit deferrals:
- Decision: `ACCEPTED` / `REJECTED` / `DEFERRED` / `PENDING`:
- Acceptance date (only if accepted):
- Reviewer signature / verifiable approval reference:

## Acceptance rules

1. A passing project test suite does not automatically accept every requirement.
2. A local smoke test is not production acceptance.
3. A migration applied to a local database is not production migration approval.
4. Provider acceptance is not proof of payment success.
5. A requirement remains `PENDING` unless its specific evidence and reviewer decision are recorded.
6. Legal, privacy, payment/accounting, penetration-testing and accessibility scopes require appropriately qualified independent reviewers.
