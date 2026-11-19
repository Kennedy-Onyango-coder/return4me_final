import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { isAllowedEvidenceMime, isEvidenceSizeAllowed, MAX_EVIDENCE_BYTES, sanitizeEvidenceFilename, SUPPORTED_EVIDENCE_TYPES } from "../../shared/document-policy.js";
import { db } from "../db/index.js";
import { agents, auditEvents, claimEvidence, claims, documentAccessEvents, documentScanEvents, documents } from "../db/schema.js";
import { authenticate, requireRole, requireStepUpInTransaction, consumeStepUpGrantInTransaction } from "../security.js";
import { hasAdminAuthority } from "../../shared/admin-role-policy.mjs";
import { assertPrivateStorageConfigured, deletePrivateObject, getPrivateObject, newPrivateStorageKey, putPrivateObject } from "../services/private-storage.js";
import { MalwareDetectedError, scanForMalware, ScannerUnavailableError } from "../services/malware-scan.js";

export const claimEvidenceRouter = Router();
claimEvidenceRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1, fields: 2, parts: 3 } });

function singleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Files must be 10 MB or smaller" });
    }
    if (error instanceof multer.MulterError) return res.status(400).json({ error: "Upload was not accepted. Attach one supported file." });
    next(error);
  });
}





class ClaimNotOpenError extends Error {
  constructor() { super("The claim changed while the file was being scanned. Refresh the claim before trying again."); }
}

async function canReadClaim(claimId: string, userId: string, roles: string[]) {
  const [claim] = await db.select({ id: claims.id, claimantId: claims.claimantId })
    .from(claims).where(eq(claims.id, claimId)).limit(1);
  if (!claim) return { allowed: false, exists: false };
  return { allowed: claim.claimantId === userId || hasAdminAuthority(roles), exists: true };
}

claimEvidenceRouter.post("/claims/:claimId/evidence", requireRole("claimant"), singleUpload, async (req, res, next) => {
  let originalKey: string | null = null;
  let previewKey: string | null = null;
  try {
    const parsed = z.object({ evidenceType: z.string().trim().min(2).max(48) }).safeParse(req.body);
    if (!parsed.success || !req.file) return res.status(400).json({ error: "Choose an evidence type and attach one PDF, JPEG, PNG or WebP file" });
    try { assertPrivateStorageConfigured(); }
    catch { return res.status(503).json({ error: "Private evidence storage is not configured. The file was not accepted." }); }
    const [claim] = await db.select().from(claims).where(and(eq(claims.id, req.params.claimId), eq(claims.claimantId, req.auth!.id))).limit(1);
    if (!claim) return res.status(404).json({ error: "Claim not found" });
    if (!["submitted", "under_review"].includes(claim.status)) return res.status(409).json({ error: "Evidence can only be added while the claim is under review" });
    if (!isEvidenceSizeAllowed(req.file.size)) return res.status(413).json({ error: "Files must be between 1 byte and 10 MB" });

    const detected = await fileTypeFromBuffer(req.file.buffer);
    if (!detected || !isAllowedEvidenceMime(detected.mime)) return res.status(415).json({ error: "Only genuine PDF, JPEG, PNG and WebP files are supported" });
    const mimeType = detected.mime;
    const extension = SUPPORTED_EVIDENCE_TYPES[mimeType];
    const scan = await scanForMalware(req.file.buffer);
    const filename = sanitizeEvidenceFilename(req.file.originalname);
    const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");

    originalKey = newPrivateStorageKey(extension);
    await putPrivateObject(originalKey, req.file.buffer, mimeType);

    if (mimeType.startsWith("image/")) {
      const preview = await sharp(req.file.buffer, { failOn: "error", limitInputPixels: 32_000_000 })
        .rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 }).toBuffer();
      previewKey = newPrivateStorageKey("webp");
      await putPrivateObject(previewKey, preview, "image/webp");
    }

    const saved = await db.transaction(async tx => {
      // Lock the claim after scanning and immediately before persistence. Review
      // and upload therefore serialize on the same claim row, closing the race
      // where an upload could finish after a reviewer had approved the claim.
      const [lockedClaim] = await tx.select({ id: claims.id, status: claims.status })
        .from(claims).where(and(eq(claims.id, claim.id), eq(claims.claimantId, req.auth!.id)))
        .limit(1).for("update");
      if (!lockedClaim || !["submitted", "under_review"].includes(lockedClaim.status)) throw new ClaimNotOpenError();
      const [document] = await tx.insert(documents).values({
        ownerId: req.auth!.id, resourceType: "claim_evidence", resourceId: claim.id,
        storageKey: originalKey!, previewStorageKey: previewKey, originalFilename: filename,
        mimeType, sizeBytes: req.file!.size, sha256, scanStatus: "clean", verificationStatus: "under_review"
      }).returning();
      const [evidence] = await tx.insert(claimEvidence).values({
        claimId: claim.id, documentId: document.id, evidenceType: parsed.data.evidenceType,
        verificationStatus: "under_review"
      }).returning({ id: claimEvidence.id, verificationStatus: claimEvidence.verificationStatus, createdAt: claimEvidence.createdAt });
      await tx.insert(documentScanEvents).values({ documentId: document.id, scanner: scan.scanner, result: scan.result, detailsCode: "clamav_clean" });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "claim.evidence_uploaded", resourceType: "claim_evidence", resourceId: evidence.id, outcome: "success", metadata: { mimeType, sizeBytes: req.file!.size, sha256 } });
      return { evidence, document: { id: document.id, originalFilename: document.originalFilename, mimeType: document.mimeType, sizeBytes: document.sizeBytes, scanStatus: document.scanStatus } };
    });
    return res.status(201).json(saved);
  } catch (error) {
    if (originalKey) await deletePrivateObject(originalKey);
    if (previewKey) await deletePrivateObject(previewKey);
    if (error instanceof MalwareDetectedError) return res.status(422).json({ error: error.message });
    if (error instanceof ScannerUnavailableError) return res.status(503).json({ error: error.message });
    if (error instanceof ClaimNotOpenError) return res.status(409).json({ error: error.message });
    next(error);
  }
});

claimEvidenceRouter.get("/claims/:claimId/evidence", async (req, res, next) => {
  try {
    const access = await canReadClaim(req.params.claimId, req.auth!.id, req.auth!.roles);
    if (!access.exists) return res.status(404).json({ error: "Claim not found" });
    if (!access.allowed) return res.status(403).json({ error: "You cannot view this claim's evidence" });
    const rows = await db.select({
      id: claimEvidence.id, evidenceType: claimEvidence.evidenceType,
      verificationStatus: claimEvidence.verificationStatus, reviewerNote: claimEvidence.reviewerNote,
      createdAt: claimEvidence.createdAt, documentId: documents.id,
      originalFilename: documents.originalFilename, mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes, scanStatus: documents.scanStatus,
      documentStatus: documents.verificationStatus
    }).from(claimEvidence).innerJoin(documents, eq(claimEvidence.documentId, documents.id))
      .where(and(eq(claimEvidence.claimId, req.params.claimId), isNull(documents.deletedAt)))
      .orderBy(desc(claimEvidence.createdAt));
    res.json({ evidence: rows.map(row => ({ ...row, reviewerNote: hasAdminAuthority(req.auth!.roles) ? row.reviewerNote : undefined })) });
  } catch (error) { next(error); }
});

claimEvidenceRouter.get("/documents/:documentId/content", async (req, res, next) => {
  try {
    const [document] = await db.select().from(documents)
      .where(and(eq(documents.id, req.params.documentId), isNull(documents.deletedAt))).limit(1);
    if (!document) return res.status(404).json({ error: "Document not found" });
    const isAdmin = hasAdminAuthority(req.auth!.roles);
    let allowed = false;
    if (document.resourceType === "claim_evidence") {
      const [claim] = await db.select({ claimantId: claims.claimantId, evidenceStatus: claimEvidence.verificationStatus })
        .from(claimEvidence).innerJoin(claims, eq(claims.id, claimEvidence.claimId))
        .where(and(eq(claimEvidence.documentId, document.id), eq(claims.id, document.resourceId))).limit(1);
      if (!claim) return res.status(404).json({ error: "Document not found" });
      allowed = claim.claimantId === req.auth!.id || isAdmin;
      if (claim.evidenceStatus === "rejected" || claim.evidenceStatus === "expired") return res.status(409).json({ error: "This document is not available for viewing" });
    } else if (["agent_identity", "agent_business", "agent_service_location"].includes(document.resourceType)) {
      const [agent] = await db.select({ userId: agents.userId }).from(agents).where(eq(agents.id, document.resourceId)).limit(1);
      if (!agent) return res.status(404).json({ error: "Document not found" });
      allowed = agent.userId === req.auth!.id || isAdmin;
      if (document.verificationStatus === "rejected" || document.verificationStatus === "expired") return res.status(409).json({ error: "This document is not available for viewing" });
    }
    if (!allowed) {
      await db.insert(documentAccessEvents).values({ documentId: document.id, actorId: req.auth!.id, accessPurpose: "private_document_content", outcome: "denied" });
      await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "privacy.document_access_denied", resourceType: "document", resourceId: document.id, outcome: "denied", metadata: { resourceType: document.resourceType } });
      return res.status(403).json({ error: "You cannot view this document" });
    }
    if (document.scanStatus !== "clean") {
      await db.insert(documentAccessEvents).values({ documentId: document.id, actorId: req.auth!.id, accessPurpose: "private_document_content", outcome: "denied" });
      return res.status(409).json({ error: "This document is not available before a clean malware scan" });
    }
    const preview = req.query.variant === "preview" && !!document.previewStorageKey;
    const key = preview ? document.previewStorageKey! : document.storageKey;
    const body = await getPrivateObject(key);
    await db.insert(documentAccessEvents).values({ documentId: document.id, actorId: req.auth!.id, accessPurpose: preview ? "private_document_preview" : "private_document_content", outcome: "allowed" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "privacy.document_accessed", resourceType: "document", resourceId: document.id, outcome: "success", metadata: { variant: preview ? "preview" : "original", resourceType: document.resourceType } });
    const mime = preview ? "image/webp" : document.mimeType;
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", String(body.length));
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(document.originalFilename)}`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.end(body);
  } catch (error) { next(error); }
});

claimEvidenceRouter.patch("/claims/:claimId/evidence/:evidenceId/review", requireRole("admin", "trust_safety"), (req, res, next) => requireStepUpInTransaction("admin.claim.evidence.review")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["verified", "rejected", "expired"]), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid evidence review decision" });
    const result = await db.transaction(async tx => {
      // Serialize evidence decisions with claim approval and evidence uploads. All
      // three workflows lock the claim row first, so a reviewer cannot change
      // supporting evidence after the ownership decision has committed.
      const [claim] = await tx.select({ id: claims.id, status: claims.status })
        .from(claims).where(eq(claims.id, req.params.claimId)).limit(1).for("update");
      if (!claim) return { kind: "not_found" as const };
      if (!["submitted", "under_review"].includes(claim.status)) return { kind: "claim_closed" as const };

      const [evidence] = await tx.select({ evidence: claimEvidence, document: documents })
        .from(claimEvidence).innerJoin(documents, eq(claimEvidence.documentId, documents.id))
        .where(and(eq(claimEvidence.id, req.params.evidenceId), eq(claimEvidence.claimId, req.params.claimId), isNull(documents.deletedAt)))
        .limit(1).for("update");
      if (!evidence) return { kind: "not_found" as const };
      if (evidence.document.scanStatus !== "clean") return { kind: "not_scannable" as const };
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.claim.evidence.review");
      const now = new Date();
      await tx.update(claimEvidence).set({ verificationStatus: parsed.data.status, reviewerId: req.auth!.id, reviewerNote: parsed.data.note || null, reviewedAt: now }).where(eq(claimEvidence.id, evidence.evidence.id));
      await tx.update(documents).set({ verificationStatus: parsed.data.status }).where(eq(documents.id, evidence.document.id));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "claim.evidence_reviewed", resourceType: "claim_evidence", resourceId: evidence.evidence.id, outcome: "success", metadata: { status: parsed.data.status } });
      return { kind: "updated" as const, evidence: { id: evidence.evidence.id, status: parsed.data.status, reviewedAt: now } };
    });
    if (result.kind === "not_found") return res.status(404).json({ error: "Claim evidence not found" });
    if (result.kind === "claim_closed") return res.status(409).json({ error: "Evidence review is closed after the ownership claim decision. Use the authorised appeal or correction workflow." });
    if (result.kind === "not_scannable") return res.status(409).json({ error: "Evidence cannot be reviewed before a clean malware scan" });
    res.json({ evidence: result.evidence });
  } catch (error) { next(error); }
});
