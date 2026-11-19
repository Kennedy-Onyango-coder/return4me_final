import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { isAllowedEvidenceMime, isEvidenceSizeAllowed, MAX_EVIDENCE_BYTES, sanitizeEvidenceFilename, SUPPORTED_EVIDENCE_TYPES } from "../../shared/document-policy.js";
import { db } from "../db/index.js";
import { agents, auditEvents, documentScanEvents, documents } from "../db/schema.js";
import { authenticate, requireRole } from "../security.js";
import { assertPrivateStorageConfigured, deletePrivateObject, newPrivateStorageKey, putPrivateObject } from "../services/private-storage.js";
import { MalwareDetectedError, scanForMalware, ScannerUnavailableError } from "../services/malware-scan.js";

export const agentDocumentsRouter = Router();
agentDocumentsRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1, fields: 2, parts: 3 } });
const applicationDocumentTypes = ["agent_identity", "agent_business", "agent_service_location"] as const;
type ApplicationDocumentType = typeof applicationDocumentTypes[number];

function singleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Files must be 10 MB or smaller" });
    if (error instanceof multer.MulterError) return res.status(400).json({ error: "Upload was not accepted. Attach one supported file." });
    next(error);
  });
}

agentDocumentsRouter.post("/me", requireRole("claimant", "finder", "agent"), singleUpload, async (req, res, next) => {
  let originalKey: string | null = null;
  let previewKey: string | null = null;
  try {
    const parsed = z.object({ documentType: z.enum(applicationDocumentTypes) }).safeParse(req.body);
    if (!parsed.success || !req.file) return res.status(400).json({ error: "Choose a document type and attach one PDF, JPEG, PNG or WebP file" });
    try { assertPrivateStorageConfigured(); }
    catch { return res.status(503).json({ error: "Private document storage is not configured. The file was not accepted." }); }
    const [agent] = await db.select({ id: agents.id, status: agents.status })
      .from(agents).where(eq(agents.userId, req.auth!.id)).limit(1);
    if (!agent) return res.status(404).json({ error: "Submit an Agent application before uploading verification documents" });
    if (agent.status === "rejected") return res.status(409).json({ error: "This application is closed. Contact support about the review decision." });
    if (!isEvidenceSizeAllowed(req.file.size)) return res.status(413).json({ error: "Files must be between 1 byte and 10 MB" });
    const detected = await fileTypeFromBuffer(req.file.buffer);
    if (!detected || !isAllowedEvidenceMime(detected.mime)) return res.status(415).json({ error: "Only genuine PDF, JPEG, PNG and WebP files are supported" });
    const mimeType = detected.mime;
    const scan = await scanForMalware(req.file.buffer);
    const filename = sanitizeEvidenceFilename(req.file.originalname);
    const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");
    originalKey = newPrivateStorageKey(SUPPORTED_EVIDENCE_TYPES[mimeType]);
    await putPrivateObject(originalKey, req.file.buffer, mimeType);
    if (mimeType.startsWith("image/")) {
      const preview = await sharp(req.file.buffer, { failOn: "error", limitInputPixels: 32_000_000 })
        .rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 }).toBuffer();
      previewKey = newPrivateStorageKey("webp");
      await putPrivateObject(previewKey, preview, "image/webp");
    }

    const saved = await db.transaction(async tx => {
      const [lockedAgent] = await tx.select({ id: agents.id, status: agents.status })
        .from(agents).where(and(eq(agents.id, agent.id), eq(agents.userId, req.auth!.id))).limit(1).for("update");
      if (!lockedAgent || lockedAgent.status === "rejected") throw new Error("Agent application is no longer eligible for document upload");
      const [latest] = await tx.select({ verificationStatus: documents.verificationStatus })
        .from(documents).where(and(eq(documents.resourceId, agent.id), eq(documents.resourceType, parsed.data.documentType), isNull(documents.deletedAt)))
        .orderBy(desc(documents.createdAt)).limit(1).for("update");
      if (latest?.verificationStatus === "under_review" || latest?.verificationStatus === "uploaded") {
        throw new Error("A document of this type is already awaiting review. Contact support to correct an existing submission.");
      }
      const [document] = await tx.insert(documents).values({
        ownerId: req.auth!.id, resourceType: parsed.data.documentType, resourceId: agent.id,
        storageKey: originalKey!, previewStorageKey: previewKey, originalFilename: filename,
        mimeType, sizeBytes: req.file!.size, sha256, scanStatus: "clean", verificationStatus: "under_review"
      }).returning({ id: documents.id, resourceType: documents.resourceType, originalFilename: documents.originalFilename, mimeType: documents.mimeType, sizeBytes: documents.sizeBytes, scanStatus: documents.scanStatus, verificationStatus: documents.verificationStatus, createdAt: documents.createdAt });
      await tx.insert(documentScanEvents).values({ documentId: document.id, scanner: scan.scanner, result: scan.result, detailsCode: "clamav_clean" });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "agent.document_uploaded", resourceType: "agent_document", resourceId: document.id, outcome: "success", metadata: { documentType: parsed.data.documentType, mimeType, sizeBytes: req.file!.size, sha256 } });
      return document;
    });
    return res.status(201).json({ document: saved, notice: "Document received for private review. Upload does not mean the document is verified or the application is approved." });
  } catch (error) {
    if (originalKey) await deletePrivateObject(originalKey);
    if (previewKey) await deletePrivateObject(previewKey);
    if (error instanceof MalwareDetectedError) return res.status(422).json({ error: error.message });
    if (error instanceof ScannerUnavailableError) return res.status(503).json({ error: error.message });
    if (error instanceof Error && (error.message.includes("no longer eligible") || error.message.includes("already awaiting review"))) return res.status(409).json({ error: error.message });
    next(error);
  }
});

agentDocumentsRouter.get("/me", requireRole("claimant", "finder", "agent"), async (req, res, next) => {
  try {
    const [agent] = await db.select({ id: agents.id }).from(agents).where(eq(agents.userId, req.auth!.id)).limit(1);
    if (!agent) return res.status(404).json({ error: "Agent application not found" });
    const rows = await db.select({
      id: documents.id, resourceType: documents.resourceType, originalFilename: documents.originalFilename,
      mimeType: documents.mimeType, sizeBytes: documents.sizeBytes, scanStatus: documents.scanStatus,
      verificationStatus: documents.verificationStatus, createdAt: documents.createdAt
    }).from(documents).where(and(eq(documents.resourceId, agent.id), isNull(documents.deletedAt)))
      .orderBy(desc(documents.createdAt));
    res.json({ documents: rows });
  } catch (error) { next(error); }
});

agentDocumentsRouter.get("/admin/:agentId", requireRole("admin"), async (req, res, next) => {
  try {
    const [agent] = await db.select({ id: agents.id, businessName: agents.businessName }).from(agents).where(eq(agents.id, req.params.agentId)).limit(1);
    if (!agent) return res.status(404).json({ error: "Agent application not found" });
    const rows = await db.select({
      id: documents.id, resourceType: documents.resourceType, originalFilename: documents.originalFilename,
      mimeType: documents.mimeType, sizeBytes: documents.sizeBytes, scanStatus: documents.scanStatus,
      verificationStatus: documents.verificationStatus, createdAt: documents.createdAt
    }).from(documents).where(and(eq(documents.resourceId, agent.id), isNull(documents.deletedAt)))
      .orderBy(desc(documents.createdAt));
    res.json({ agent, documents: rows });
  } catch (error) { next(error); }
});

agentDocumentsRouter.patch("/admin/:agentId/:documentId/review", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["verified", "rejected", "expired"]), note: z.string().trim().min(4).max(1000), expiresAt: z.string().datetime().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a review status and a reason of at least four characters" });
    const result = await db.transaction(async tx => {
      const [document] = await tx.select().from(documents)
        .where(and(eq(documents.id, req.params.documentId), eq(documents.resourceId, req.params.agentId), inArray(documents.resourceType, applicationDocumentTypes), isNull(documents.deletedAt)))
        .limit(1).for("update");
      if (!document) return null;
      if (document.scanStatus !== "clean") throw new Error("Document cannot be verified before a clean malware scan");
      await tx.update(documents).set({ verificationStatus: parsed.data.status, expiresAt: parsed.data.status === "expired" ? new Date() : parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : document.expiresAt }).where(eq(documents.id, document.id));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "agent.document_reviewed", resourceType: "agent_document", resourceId: document.id, outcome: "success", metadata: { status: parsed.data.status, note: parsed.data.note } });
      return { id: document.id, status: parsed.data.status };
    });
    if (!result) return res.status(404).json({ error: "Agent document not found" });
    res.json({ document: result });
  } catch (error) {
    if (error instanceof Error && error.message.includes("cannot be verified")) return res.status(409).json({ error: error.message });
    next(error);
  }
});


// Soft-delete an obsolete/replaced private file, purge its object bytes, and retain an attributable audit record.
agentDocumentsRouter.delete("/admin/:agentId/:documentId", requireRole("admin"), async (req, res, next) => {
  const parsed = z.object({ reason: z.string().trim().min(10).max(1000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A deletion reason of at least ten characters is required" });
  try {
    const result = await db.transaction(async tx => {
      const [document] = await tx.select().from(documents)
        .where(and(eq(documents.id, req.params.documentId), eq(documents.resourceId, req.params.agentId), inArray(documents.resourceType, [...applicationDocumentTypes, "agent_training"]), isNull(documents.deletedAt)))
        .limit(1).for("update");
      if (!document) return null;
      await tx.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, document.id));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "agent.document_deleted", resourceType: "agent_document", resourceId: document.id, outcome: "success", metadata: { reason: parsed.data.reason, sha256: document.sha256 } });
      return { storageKey: document.storageKey, previewStorageKey: document.previewStorageKey, id: document.id };
    });
    if (!result) return res.status(404).json({ error: "Active Agent document not found" });
    await deletePrivateObject(result.storageKey);
    if (result.previewStorageKey) await deletePrivateObject(result.previewStorageKey);
    res.json({ deleted: true, documentId: result.id, auditRetained: true });
  } catch (error) { next(error); }
});
