# Private evidence upload — operations note

## Current implementation

The first evidence upload route is scoped to claimant-owned claims. It accepts one PDF/JPEG/PNG/WebP file, up to 10 MiB. MIME headers and filename extensions are not trusted; the server inspects the file signature. The bytes are scanned through a ClamAV `clamd` INSTREAM connection. A scanner outage, timeout, malformed response or malware result rejects the upload. No file is stored if malware scanning cannot complete successfully.

After a clean result, the original is written to private storage and the SHA-256 is recorded. Images are decoded and re-encoded to WebP after orientation normalisation; this generates a metadata-stripped preview without replacing the original evidence. The document's content endpoint is protected by claimant ownership or Admin/Trust & Safety role checks. Responses are private/no-store, nosniff, and sandboxed. Uploaded files remain `under_review` until an authorised reviewer verifies/rejects/expires the evidence.

## Local development

Set in `.env`:

```env
FILE_STORAGE_DRIVER=local
PRIVATE_UPLOAD_DIR=.private-uploads
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
```

Run ClamAV's daemon (`clamd`) on a local-only or otherwise tightly restricted interface. Confirm that the daemon's `StreamMaxLength` exceeds the app's 10 MiB upload maximum. The API uses the ClamAV INSTREAM protocol and must be able to reach the configured host/port. Do not expose the clamd TCP listener to the public internet: ClamAV's TCP protocol is not encrypted or authenticated.

The local directory is created with restrictive permissions and is deliberately outside Vite's static root. Add the directory to backup/retention controls only after choosing an appropriate encrypted backup design; it must never be copied into public web assets or committed to source control.

## Production storage

Production startup rejects local-file storage. Configure:

```env
FILE_STORAGE_DRIVER=s3
S3_BUCKET=private-return4me-evidence
S3_REGION=your-region
```

Use a dedicated private bucket, Block Public Access, bucket-owner-enforced object ownership, encryption, least-privilege IAM access, access logging, versioning/retention and tested backup/recovery. No public ACLs or public object URLs. The app requests server-side AES256 encryption on put operations; the infrastructure must still enforce and verify the bucket's encryption and access policies. Configure an authenticated private network path to ClamAV and monitor its health. The application does not automatically audit your bucket policy or scanner network boundary.

## Not yet accepted

- ClamAV setup, EICAR test, oversize, malformed file, polyglot and malware-evasion tests.
- S3 permissions, public access block, encryption and backup/restore tests.
- Agent KYC/document uploads and training certificates.
- Retention schedules, expiry worker, deletion approval and legal-hold preservation.
- Evidence resubmission/replacement lifecycle and document review UI.
- Data Protection Act/ODPC, DPIA, processor contract and cross-border transfer review.
- Independent penetration testing and file-processing resource exhaustion tests.
