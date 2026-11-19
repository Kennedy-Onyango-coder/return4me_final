import {
  pgTable, pgEnum, uuid, varchar, text, timestamp, boolean, integer, bigint, jsonb, numeric,
  index, uniqueIndex, date, check
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Legacy delegated admin labels remain in the PostgreSQL enum for migration compatibility only.
// Application-visible privileged roles are exclusively Admin and Owner.
export const roleEnum = pgEnum("user_role", ["claimant", "finder", "agent", "organisation", "admin", "owner", "finance", "trust_safety", "communications_writer", "communications_approver", "communications_publisher", "support"]);
export const reportKindEnum = pgEnum("report_kind", ["lost", "found"]);
export const reportStatusEnum = pgEnum("report_status", ["submitted", "under_review", "published", "matched", "closed", "rejected"]);
export const claimStatusEnum = pgEnum("claim_status", ["submitted", "under_review", "approved", "rejected", "disputed", "completed", "cancelled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["initiated", "pending", "confirmed", "failed", "reversed", "refunded", "unknown"]);
export const settlementStatusEnum = pgEnum("settlement_status", ["ineligible", "on_hold", "eligible", "approved", "payout_pending", "paid", "failed", "reversed"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  fullName: varchar("full_name", { length: 180 }),
  phoneMasked: varchar("phone_masked", { length: 40 }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  isSuspended: boolean("is_suspended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("users_email_unique").on(t.email)]);

export const userRoles = pgTable("user_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  grantedBy: uuid("granted_by").references(() => users.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
}, t => [index("user_roles_user_idx").on(t.userId), uniqueIndex("user_roles_active_unique").on(t.userId, t.role).where(sql`${t.revokedAt} is null`)]);

export const userSessions = pgTable("user_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("user_sessions_token_hash_unique").on(t.tokenHash), index("user_sessions_user_idx").on(t.userId, t.expiresAt)]);

export const otpChallenges = pgTable("otp_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  codeHash: varchar("code_hash", { length: 128 }).notNull(),
  purpose: varchar("purpose", { length: 40 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("otp_email_created_idx").on(t.email, t.createdAt)]);


export const adminStepUpGrants = pgTable("admin_step_up_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => userSessions.id, { onDelete: "cascade" }),
  purpose: varchar("purpose", { length: 100 }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("admin_step_up_grant_lookup_idx").on(t.userId, t.sessionId, t.purpose, t.expiresAt)]);

export const organisations = pgTable("organisations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 220 }).notNull(),
  registrationNumber: varchar("registration_number", { length: 120 }),
  county: varchar("county", { length: 80 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const organisationMembers = pgTable("organisation_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 40 }).notNull().default("report_viewer"),
  invitedBy: uuid("invited_by").references(() => users.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
}, t => [index("org_members_user_idx").on(t.userId), uniqueIndex("org_members_unique").on(t.organisationId, t.userId)]);

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reference: varchar("reference", { length: 24 }).notNull(),
  kind: reportKindEnum("kind").notNull(),
  reporterId: uuid("reporter_id").references(() => users.id),
  reporterEmail: varchar("reporter_email", { length: 320 }),
  reporterEmailVerifiedAt: timestamp("reporter_email_verified_at", { withTimezone: true }),
  reporterRelationship: varchar("reporter_relationship", { length: 40 }).notNull().default("self"),
  subjectName: varchar("subject_name", { length: 180 }),
  organisationId: uuid("organisation_id").references(() => organisations.id),
  category: varchar("category", { length: 100 }).notNull(),
  itemDescription: text("item_description").notNull(),
  county: varchar("county", { length: 80 }).notNull(),
  approximateLocation: varchar("approximate_location", { length: 240 }),
  incidentDate: date("incident_date"),
  status: reportStatusEnum("status").notNull().default("submitted"),
  publicListingConsent: boolean("public_listing_consent").notNull().default(false),
  publicDescription: text("public_description"),
  privateMetadata: jsonb("private_metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("reports_reference_unique").on(t.reference), index("reports_kind_status_idx").on(t.kind, t.status), index("reports_reporter_idx").on(t.reporterId), index("reports_reporter_email_idx").on(t.reporterEmail)]);

// Short-lived proof that a guest verified control of an email address before submitting.
// The raw proof is returned once to the browser and is never stored.
export const guestReportVerifications = pgTable("guest_report_verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("guest_report_verification_token_unique").on(t.tokenHash), index("guest_report_verification_email_idx").on(t.email, t.createdAt)]);

// A high-entropy bearer token is exchanged through the URL fragment for an HttpOnly
// cookie. Tracking responses contain only non-sensitive case progress metadata.
export const guestReportAccess = pgTable("guest_report_access", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("guest_report_access_token_unique").on(t.tokenHash), index("guest_report_access_report_idx").on(t.reportId, t.expiresAt)]);

export const claims = pgTable("claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  reference: varchar("reference", { length: 24 }).notNull(),
  reportId: uuid("report_id").notNull().references(() => reports.id),
  claimantId: uuid("claimant_id").notNull().references(() => users.id),
  ownershipEvidenceSummary: text("ownership_evidence_summary"),
  claimantRelationship: varchar("claimant_relationship", { length: 40 }).notNull().default("owner"),
  representedPersonName: varchar("represented_person_name", { length: 180 }),
  authorityDeclaration: text("authority_declaration"),
  authorityVerificationStatus: varchar("authority_verification_status", { length: 24 }).notNull().default("not_required"),
  authorityVerifiedBy: uuid("authority_verified_by").references(() => users.id),
  authorityVerifiedAt: timestamp("authority_verified_at", { withTimezone: true }),
  status: claimStatusEnum("status").notNull().default("submitted"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  disputeReason: text("dispute_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("claims_reference_unique").on(t.reference), index("claims_report_idx").on(t.reportId), index("claims_user_idx").on(t.claimantId)]);

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  businessName: varchar("business_name", { length: 180 }).notNull(),
  serviceAddress: varchar("service_address", { length: 240 }).notNull(),
  servicePhone: varchar("service_phone", { length: 24 }),
  servicePhoneVerifiedAt: timestamp("service_phone_verified_at", { withTimezone: true }),
  county: varchar("county", { length: 80 }).notNull(),
  capacityNotes: text("capacity_notes"),
  payoutDestinationRef: text("payout_destination_ref"),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("agents_status_county_idx").on(t.status, t.county), uniqueIndex("agents_user_unique").on(t.userId)]);

export const assignments = pgTable("assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id").notNull().references(() => reports.id),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  assignedBy: uuid("assigned_by").references(() => users.id),
  status: varchar("status", { length: 32 }).notNull().default("assigned"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true })
}, t => [index("assignments_agent_status_idx").on(t.agentId, t.status), index("assignments_report_idx").on(t.reportId), uniqueIndex("assignments_one_active_per_report").on(t.reportId).where(sql`${t.status} = 'assigned'`)]);

export const custodyEvents = pgTable("custody_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id").notNull().references(() => reports.id),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  evidenceRef: text("evidence_ref"),
  notes: text("notes"),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  previousHash: varchar("previous_hash", { length: 64 }),
  eventHash: varchar("event_hash", { length: 64 }),
  hashVersion: varchar("hash_version", { length: 8 }).notNull().default("v2"),
  sequenceNo: integer("sequence_no"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("custody_report_time_idx").on(t.reportId, t.createdAt), uniqueIndex("custody_events_report_sequence_unique").on(t.reportId, t.sequenceNo).where(sql`${t.sequenceNo} IS NOT NULL`)]);

export const paymentTransactions = pgTable("payment_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimId: uuid("claim_id").notNull().references(() => claims.id),
  provider: varchar("provider", { length: 40 }).notNull().default("intasend"),
  providerReference: varchar("provider_reference", { length: 180 }),
  assessmentId: uuid("assessment_id"),
  providerInvoiceId: varchar("provider_invoice_id", { length: 180 }),
  payerPhoneMasked: varchar("payer_phone_masked", { length: 24 }),
  payerPhoneCiphertext: text("payer_phone_ciphertext"),
  payerPhoneFingerprint: varchar("payer_phone_fingerprint", { length: 64 }),
  sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }),
  providerState: varchar("provider_state", { length: 32 }),
  providerReceipt: varchar("provider_receipt", { length: 80 }),
  providerFeeKes: numeric("provider_fee_kes", { precision: 14, scale: 2 }),
  providerFeeVerifiedAt: timestamp("provider_fee_verified_at", { withTimezone: true }),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  amountKes: numeric("amount_kes", { precision: 14, scale: 2 }).notNull(),
  status: paymentStatusEnum("status").notNull().default("initiated"),
  idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("payment_idempotency_unique").on(t.idempotencyKey), uniqueIndex("payment_provider_invoice_unique").on(t.providerInvoiceId).where(sql`${t.providerInvoiceId} IS NOT NULL`), index("payment_claim_idx").on(t.claimId), index("payment_assessment_idx").on(t.assessmentId)]);

export const paymentWebhookDeliveries = pgTable("payment_webhook_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull().default("intasend"),
  providerEventKey: varchar("provider_event_key", { length: 220 }).notNull(),
  providerInvoiceId: varchar("provider_invoice_id", { length: 180 }),
  apiReference: varchar("api_reference", { length: 120 }),
  topic: varchar("topic", { length: 60 }),
  state: varchar("state", { length: 32 }),
  authenticated: boolean("authenticated").notNull().default(false),
  outcome: varchar("outcome", { length: 40 }).notNull().default("received"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true })
}, t => [uniqueIndex("payment_webhook_provider_event_unique").on(t.provider, t.providerEventKey), index("payment_webhook_invoice_idx").on(t.providerInvoiceId, t.receivedAt)]);

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => paymentTransactions.id),
  entryType: varchar("entry_type", { length: 40 }).notNull(),
  amountKes: numeric("amount_kes", { precision: 14, scale: 2 }).notNull(),
  accountCode: varchar("account_code", { length: 60 }).notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("ledger_transaction_idx").on(t.transactionId), check("ledger_amount_nonzero", sql`${t.amountKes} <> 0`)]);

export const financialJournals = pgTable("financial_journals", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  sourceId: varchar("source_id", { length: 160 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KES"),
  memo: text("memo").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdTxid: bigint("created_txid", { mode: "number" }).notNull().default(sql`txid_current()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("financial_journals_idempotency_unique").on(t.idempotencyKey), uniqueIndex("financial_journals_source_unique").on(t.sourceType, t.sourceId).where(sql`${t.sourceType} <> 'correction'`), index("financial_journals_created_idx").on(t.createdAt)]);

export const financialPostings = pgTable("financial_postings", {
  id: uuid("id").defaultRandom().primaryKey(),
  journalId: uuid("journal_id").notNull().references(() => financialJournals.id),
  accountCode: varchar("account_code", { length: 60 }).notNull(),
  debitKes: numeric("debit_kes", { precision: 14, scale: 2 }).notNull().default("0"),
  creditKes: numeric("credit_kes", { precision: 14, scale: 2 }).notNull().default("0"),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("financial_postings_journal_idx").on(t.journalId), index("financial_postings_account_idx").on(t.accountCode, t.createdAt), check("financial_posting_one_sided_positive", sql`(${t.debitKes} > 0 and ${t.creditKes} = 0) or (${t.creditKes} > 0 and ${t.debitKes} = 0)`) ]);

export const settlements = pgTable("settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimId: uuid("claim_id").notNull().references(() => claims.id),
  finderUserId: uuid("finder_user_id").notNull().references(() => users.id),
  agentUserId: uuid("agent_user_id").notNull().references(() => users.id),
  grossKes: numeric("gross_kes", { precision: 14, scale: 2 }).notNull(),
  finderKes: numeric("finder_kes", { precision: 14, scale: 2 }).notNull(),
  agentKes: numeric("agent_kes", { precision: 14, scale: 2 }).notNull(),
  platformKes: numeric("platform_kes", { precision: 14, scale: 2 }).notNull(),
  finderPercent: integer("finder_percent").notNull().default(33),
  agentPercent: integer("agent_percent").notNull().default(25),
  platformPercent: integer("platform_percent").notNull().default(42),
  allocationPolicyVersion: varchar("allocation_policy_version", { length: 48 }).notNull().default("legacy_snapshot_unversioned"),
  allocationSnapshotAt: timestamp("allocation_snapshot_at", { withTimezone: true }),
  allocationSnapshotSource: varchar("allocation_snapshot_source", { length: 32 }).notNull().default("legacy_existing"),
  status: settlementStatusEnum("status").notNull().default("ineligible"),
  settleAt: timestamp("settle_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvalMode: varchar("approval_mode", { length: 24 }),
  payoutInitiatedAt: timestamp("payout_initiated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("settlements_claim_unique").on(t.claimId), index("settlements_status_idx").on(t.status, t.settleAt), check("settlement_split_totals_100", sql`${t.finderPercent} + ${t.agentPercent} + ${t.platformPercent} = 100`), check("settlement_allocation_balances", sql`${t.finderKes} + ${t.agentKes} + ${t.platformKes} = ${t.grossKes}`)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 60 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  link: text("link"),
  category: varchar("category", { length: 32 }).notNull().default("service"),
  priority: varchar("priority", { length: 16 }).notNull().default("normal"),
  outboxId: uuid("outbox_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("notifications_user_created_idx").on(t.userId, t.createdAt), uniqueIndex("notifications_outbox_unique").on(t.outboxId)]);

export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 60 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  link: text("link"),
  category: varchar("category", { length: 32 }).notNull().default("service"),
  priority: varchar("priority", { length: 16 }).notNull().default("normal"),
  dedupeKey: varchar("dedupe_key", { length: 180 }),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastErrorCode: varchar("last_error_code", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true })
}, t => [index("notification_outbox_due_idx").on(t.status, t.nextAttemptAt, t.createdAt), uniqueIndex("notification_outbox_dedupe_unique").on(t.dedupeKey).where(sql`${t.dedupeKey} is not null`)]);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  inAppCommunityUpdates: boolean("in_app_community_updates").notNull().default(true),
  emailCommunityUpdates: boolean("email_community_updates").notNull().default(false),
  smsCommunityUpdates: boolean("sms_community_updates").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const communicationConsents = pgTable("communication_consents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: varchar("channel", { length: 16 }).notNull(),
  purpose: varchar("purpose", { length: 32 }).notNull(),
  status: varchar("status", { length: 12 }).notNull(),
  policyVersion: varchar("policy_version", { length: 40 }).notNull(),
  consentTextHash: varchar("consent_text_hash", { length: 64 }).notNull(),
  source: varchar("source", { length: 24 }).notNull().default("account_settings"),
  grantedAt: timestamp("granted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("communication_consents_user_idx").on(t.userId, t.channel, t.purpose, t.createdAt), uniqueIndex("communication_consents_active_unique").on(t.userId, t.channel, t.purpose).where(sql`${t.status} = 'granted'`)]);

export const communicationsGovernance = pgTable("communications_governance", {
  singletonId: integer("singleton_id").primaryKey().default(1),
  approverUserId: uuid("approver_user_id").references(() => users.id),
  publisherUserId: uuid("publisher_user_id").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const communicationsDeliveryEvents = pgTable("communications_delivery_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  channel: varchar("channel", { length: 16 }).notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerEventId: varchar("provider_event_id", { length: 180 }).notNull(),
  eventType: varchar("event_type", { length: 32 }).notNull(),
  recipientHash: varchar("recipient_hash", { length: 64 }),
  messageReferenceHash: varchar("message_reference_hash", { length: 64 }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("communications_delivery_provider_event_unique").on(t.provider, t.providerEventId), index("communications_delivery_event_time_idx").on(t.channel, t.eventType, t.occurredAt)]);


export const dataRightsRequests = pgTable("data_rights_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  requestType: varchar("request_type", { length: 24 }).notNull(),
  details: varchar("details", { length: 1500 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("received"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewNote: varchar("review_note", { length: 1500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
}, t => [index("data_rights_user_created_idx").on(t.userId, t.createdAt), index("data_rights_status_created_idx").on(t.status, t.createdAt)]);

export const adminActionApprovals = pgTable("admin_action_approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 80 }).notNull(),
  resourceId: varchar("resource_id", { length: 120 }).notNull(),
  proposedBy: uuid("proposed_by").notNull().references(() => users.id),
  proposalReason: text("proposal_reason").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewReason: text("review_reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
}, t => [index("admin_approval_pending_idx").on(t.status, t.expiresAt, t.createdAt), index("admin_approval_resource_idx").on(t.resourceType, t.resourceId, t.createdAt), uniqueIndex("admin_approval_one_pending_resource_idx").on(t.resourceType, t.resourceId).where(sql`${t.status} = 'pending'`)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 80 }).notNull(),
  resourceId: varchar("resource_id", { length: 120 }),
  outcome: varchar("outcome", { length: 30 }).notNull(),
  correlationId: varchar("correlation_id", { length: 80 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("audit_resource_idx").on(t.resourceType, t.resourceId), index("audit_actor_idx").on(t.actorId, t.createdAt), index("audit_created_idx").on(t.createdAt)]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  resourceType: varchar("resource_type", { length: 60 }).notNull(),
  resourceId: varchar("resource_id", { length: 120 }).notNull(),
  storageKey: text("storage_key").notNull(),
  previewStorageKey: text("preview_storage_key"),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  scanStatus: varchar("scan_status", { length: 24 }).notNull().default("pending"),
  verificationStatus: varchar("verification_status", { length: 24 }).notNull().default("uploaded"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("documents_resource_idx").on(t.resourceType, t.resourceId)]);

export const documentStorageDeletionOutbox = pgTable("document_storage_deletion_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  storageKey: text("storage_key").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastErrorCode: varchar("last_error_code", { length: 80 }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("document_storage_delete_unique").on(t.documentId, t.storageKey),
  index("document_storage_delete_due_idx").on(t.status, t.nextAttemptAt),
  check("document_storage_delete_status_check", sql`${t.status} in ('pending','retry','processing','deleted','dead')`),
  check("document_storage_delete_attempt_check", sql`${t.attemptCount} >= 0`)]);

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  providerEventId: varchar("provider_event_id", { length: 180 }).notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  status: varchar("status", { length: 24 }).notNull().default("received"),
  safeMetadata: jsonb("safe_metadata").$type<Record<string, unknown>>().notNull().default({})
}, t => [uniqueIndex("webhook_provider_event_unique").on(t.provider, t.providerEventId)]);

// Stage 1–17 domain extensions. Sensitive identifiers and raw one-time codes are never stored here.
export const matchCandidates = pgTable("match_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  lostReportId: uuid("lost_report_id").notNull().references(() => reports.id),
  foundReportId: uuid("found_report_id").notNull().references(() => reports.id),
  matchTier: varchar("match_tier", { length: 32 }).notNull(),
  score: integer("score").notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  status: varchar("status", { length: 32 }).notNull().default("pending_review"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("match_candidate_pair_unique").on(t.lostReportId, t.foundReportId), index("match_candidates_review_idx").on(t.status, t.createdAt), check("match_score_range", sql`${t.score} >= 0 and ${t.score} <= 100`)]);

export const claimEvidence = pgTable("claim_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  evidenceType: varchar("evidence_type", { length: 48 }).notNull(),
  verificationStatus: varchar("verification_status", { length: 24 }).notNull().default("under_review"),
  reviewerId: uuid("reviewer_id").references(() => users.id),
  reviewerNote: text("reviewer_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("claim_evidence_claim_idx").on(t.claimId)]);

export const caseDisputes = pgTable("case_disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimId: uuid("claim_id").notNull().references(() => claims.id),
  reportId: uuid("report_id").notNull().references(() => reports.id),
  openedBy: uuid("opened_by").notNull().references(() => users.id),
  reasonCode: varchar("reason_code", { length: 48 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("open"),
  releaseHold: boolean("release_hold").notNull().default(true),
  settlementHold: boolean("settlement_hold").notNull().default(true),
  resolution: text("resolution"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("case_disputes_status_idx").on(t.status, t.createdAt), index("case_disputes_claim_idx").on(t.claimId)]);

export const claimAppeals = pgTable("claim_appeals", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  submittedBy: uuid("submitted_by").notNull().references(() => users.id),
  grounds: text("grounds").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("submitted"),
  reviewerNote: text("reviewer_note"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("claim_appeals_claim_idx").on(t.claimId, t.createdAt), uniqueIndex("claim_appeals_one_open_per_claim").on(t.claimId).where(sql`${t.status} in ('submitted', 'under_review')`)]);

export const organisationInvitations = pgTable("organisation_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  permission: varchar("permission", { length: 40 }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("org_invites_email_idx").on(t.email, t.expiresAt)]);

export const organisationActivities = pgTable("organisation_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 60 }).notNull(),
  resourceId: varchar("resource_id", { length: 120 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("org_activity_org_time_idx").on(t.organisationId, t.createdAt)]);

export const agentTrainingRecords = pgTable("agent_training_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  moduleCode: varchar("module_code", { length: 64 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("not_started"),
  scorePercent: integer("score_percent"),
  evidenceDocumentId: uuid("evidence_document_id").references(() => documents.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  verifiedBy: uuid("verified_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("agent_training_module_unique").on(t.agentId, t.moduleCode), index("agent_training_status_idx").on(t.status)]);

export const agentAvailability = pgTable("agent_availability", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  available: boolean("available").notNull().default(false),
  capacityLimit: integer("capacity_limit").notNull().default(0),
  currentLoad: integer("current_load").notNull().default(0),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("agent_availability_agent_unique").on(t.agentId), check("agent_capacity_nonnegative", sql`${t.capacityLimit} >= 0 and ${t.currentLoad} >= 0`)]);

export const custodyTransferConfirmations = pgTable("custody_transfer_confirmations", {
  id: uuid("id").defaultRandom().primaryKey(),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  actorRole: varchar("actor_role", { length: 16 }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("custody_transfer_confirmation_actor_unique").on(t.assignmentId, t.actorId, t.actorRole), index("custody_transfer_confirmation_assignment_idx").on(t.assignmentId)]);

export const handoverAuthorisations = pgTable("handover_authorisations", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id").notNull().references(() => reports.id),
  claimId: uuid("claim_id").references(() => claims.id),
  assignmentId: uuid("assignment_id").references(() => assignments.id),
  purpose: varchar("purpose", { length: 32 }).notNull(),
  codeHash: varchar("code_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("handover_auth_report_idx").on(t.reportId, t.purpose), index("handover_auth_expiry_idx").on(t.expiresAt)]);

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  reference: varchar("reference", { length: 24 }).notNull(),
  requesterId: uuid("requester_id").notNull().references(() => users.id),
  assignedTo: uuid("assigned_to").references(() => users.id),
  relatedReportId: uuid("related_report_id").references(() => reports.id),
  relatedClaimId: uuid("related_claim_id").references(() => claims.id),
  category: varchar("category", { length: 48 }).notNull(),
  subject: varchar("subject", { length: 180 }).notNull(),
  description: text("description").notNull(),
  priority: varchar("priority", { length: 16 }).notNull().default("normal"),
  status: varchar("status", { length: 24 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("support_ticket_reference_unique").on(t.reference), index("support_ticket_queue_idx").on(t.status, t.priority, t.createdAt)]);

export const supportMessages = pgTable("support_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  visibility: varchar("visibility", { length: 16 }).notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("support_messages_ticket_idx").on(t.ticketId, t.createdAt)]);

export const itemCategories = pgTable("item_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 110 }).notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("item_category_slug_unique").on(t.slug)]);

export const pricingSchedules = pgTable("pricing_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  version: varchar("version", { length: 40 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KES"),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("pricing_schedule_version_unique").on(t.version), index("pricing_schedule_status_idx").on(t.status, t.effectiveFrom)]);

export const pricingRules = pgTable("pricing_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  scheduleId: uuid("schedule_id").notNull().references(() => pricingSchedules.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => itemCategories.id),
  subcategory: varchar("subcategory", { length: 100 }),
  amountKes: numeric("amount_kes", { precision: 12, scale: 2 }).notNull(),
  rulePriority: integer("rule_priority").notNull().default(10),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("pricing_rules_schedule_idx").on(t.scheduleId, t.categoryId), check("pricing_amount_nonnegative", sql`${t.amountKes} >= 0`)]);

export const paymentAssessments = pgTable("payment_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimId: uuid("claim_id").notNull().references(() => claims.id),
  scheduleId: uuid("schedule_id").notNull().references(() => pricingSchedules.id),
  amountKes: numeric("amount_kes", { precision: 12, scale: 2 }).notNull(),
  lineItems: jsonb("line_items").$type<Array<{label:string;amountKes:string}>>().notNull().default([]),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  paymentWindowExpiresAt: timestamp("payment_window_expires_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("payment_assessment_claim_idx").on(t.claimId, t.createdAt), check("payment_assessment_nonnegative", sql`${t.amountKes} >= 0`)]);

export const payoutDestinations = pgTable("payout_destinations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  method: varchar("method", { length: 24 }).notNull().default("mpesa_b2c"),
  phoneMasked: varchar("phone_masked", { length: 24 }).notNull(),
  phoneCiphertext: text("phone_ciphertext").notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  evidenceRef: text("evidence_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("payout_destination_user_status_idx").on(t.userId, t.status, t.createdAt), uniqueIndex("payout_destination_active_user_unique").on(t.userId).where(sql`${t.status} IN ('pending','verified')`)]);

export const thirdPartyPayerAuthorizations = pgTable("third_party_payer_authorizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentTransactionId: uuid("payment_transaction_id").notNull().references(() => paymentTransactions.id),
  claimId: uuid("claim_id").notNull().references(() => claims.id),
  claimantUserId: uuid("claimant_user_id").notNull().references(() => users.id),
  payerRelationship: varchar("payer_relationship", { length: 24 }).notNull(),
  payerFingerprint: varchar("payer_fingerprint", { length: 64 }).notNull(),
  consentConfirmed: boolean("consent_confirmed").notNull().default(false),
  consentPolicyVersion: varchar("consent_policy_version", { length: 48 }).notNull(),
  consentTextHash: varchar("consent_text_hash", { length: 64 }).notNull(),
  attestedAt: timestamp("attested_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("third_party_payer_payment_unique").on(t.paymentTransactionId), index("third_party_payer_claim_idx").on(t.claimId, t.createdAt), index("third_party_payer_claimant_idx").on(t.claimantUserId, t.createdAt)]);

export const settlementAllocationReviews = pgTable("settlement_allocation_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  settlementId: uuid("settlement_id").notNull().references(() => settlements.id),
  reviewedPolicyVersion: varchar("reviewed_policy_version", { length: 48 }).notNull(),
  snapshotFinderPercent: integer("snapshot_finder_percent").notNull(),
  snapshotAgentPercent: integer("snapshot_agent_percent").notNull(),
  snapshotPlatformPercent: integer("snapshot_platform_percent").notNull(),
  snapshotFinderKes: numeric("snapshot_finder_kes", { precision: 14, scale: 2 }).notNull(),
  snapshotAgentKes: numeric("snapshot_agent_kes", { precision: 14, scale: 2 }).notNull(),
  snapshotPlatformKes: numeric("snapshot_platform_kes", { precision: 14, scale: 2 }).notNull(),
  varianceDetected: boolean("variance_detected").notNull(),
  reviewStatus: varchar("review_status", { length: 24 }).notNull().default("recorded"),
  reviewedBy: uuid("reviewed_by").notNull().references(() => users.id),
  reviewNote: varchar("review_note", { length: 1500 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("settlement_allocation_review_idx").on(t.settlementId, t.createdAt)]);

export const payoutDestinationVerificationEvents = pgTable("payout_destination_verification_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  payoutDestinationId: uuid("payout_destination_id").notNull().references(() => payoutDestinations.id),
  beneficiaryUserId: uuid("beneficiary_user_id").notNull().references(() => users.id),
  verifierUserId: uuid("verifier_user_id").notNull().references(() => users.id),
  outcome: varchar("outcome", { length: 24 }).notNull(),
  evidenceReferenceHash: varchar("evidence_reference_hash", { length: 64 }).notNull(),
  note: varchar("note", { length: 1000 }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("payout_destination_verification_history_idx").on(t.payoutDestinationId, t.verifiedAt)]);

export const financePeriodCloseRequests = pgTable("finance_period_close_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(),
  snapshotPayload: jsonb("snapshot_payload").$type<Record<string, unknown>>().notNull(),
  evidenceReference: varchar("evidence_reference", { length: 500 }).notNull(),
  submittedBy: uuid("submitted_by").notNull().references(() => users.id),
  status: varchar("status", { length: 32 }).notNull().default("submitted"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewNote: varchar("review_note", { length: 1500 }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true })
}, t => [index("finance_period_close_status_idx").on(t.status, t.periodEnd)]);

export const providerReversalCases = pgTable("provider_reversal_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentTransactionId: uuid("payment_transaction_id").notNull().references(() => paymentTransactions.id),
  reversalType: varchar("reversal_type", { length: 24 }).notNull(),
  amountKes: numeric("amount_kes", { precision: 14, scale: 2 }).notNull(),
  providerReference: varchar("provider_reference", { length: 180 }).notNull(),
  evidenceReference: varchar("evidence_reference", { length: 500 }).notNull(),
  evidenceHash: varchar("evidence_hash", { length: 64 }).notNull(),
  reportedBy: uuid("reported_by").notNull().references(() => users.id),
  status: varchar("status", { length: 24 }).notNull().default("received"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewNote: varchar("review_note", { length: 1500 }),
  reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true })
}, t => [uniqueIndex("provider_reversal_reference_unique").on(t.providerReference), index("provider_reversal_status_idx").on(t.status, t.reportedAt)]);

export const providerStatementEvidence = pgTable("provider_statement_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  evidenceReference: varchar("evidence_reference", { length: 500 }).notNull(),
  contentSha256: varchar("content_sha256", { length: 64 }).notNull(),
  declaredRowCount: integer("declared_row_count").notNull(),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  status: varchar("status", { length: 24 }).notNull().default("received"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewNote: varchar("review_note", { length: 1500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true })
}, t => [index("provider_statement_evidence_period_idx").on(t.provider, t.periodStart, t.periodEnd, t.status), uniqueIndex("provider_statement_content_hash_unique").on(t.provider, t.contentSha256)]);

export const dormantLiabilityReviews = pgTable("dormant_liability_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  liabilityType: varchar("liability_type", { length: 32 }).notNull(),
  liabilityReference: varchar("liability_reference", { length: 160 }).notNull(),
  beneficiaryUserId: uuid("beneficiary_user_id").references(() => users.id),
  amountKes: numeric("amount_kes", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KES"),
  agingDays: integer("aging_days").notNull(),
  reviewStatus: varchar("review_status", { length: 24 }).notNull().default("needs_contact"),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  evidenceReference: varchar("evidence_reference", { length: 500 }),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewNote: varchar("review_note", { length: 1500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("dormant_liability_type_reference_unique").on(t.liabilityType, t.liabilityReference), index("dormant_liability_aging_idx").on(t.reviewStatus, t.agingDays)]);

export const rewardAuthorizations = pgTable("reward_authorizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimId: uuid("claim_id").notNull().references(() => claims.id),
  grossKes: numeric("gross_kes", { precision: 14, scale: 2 }).notNull(),
  fundingSource: varchar("funding_source", { length: 80 }).notNull(),
  sourceReference: varchar("source_reference", { length: 180 }).notNull(),
  evidenceRef: text("evidence_ref").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending_verification"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("reward_authorization_claim_unique").on(t.claimId), index("reward_authorization_status_idx").on(t.status, t.createdAt), check("reward_authorization_gross_positive", sql`${t.grossKes} > 0`)]);

export const payoutRequests = pgTable("payout_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  settlementId: uuid("settlement_id").notNull().references(() => settlements.id),
  beneficiaryUserId: uuid("beneficiary_user_id").notNull().references(() => users.id),
  amountKes: numeric("amount_kes", { precision: 14, scale: 2 }).notNull(),
  destinationFingerprint: varchar("destination_fingerprint", { length: 128 }).notNull(),
  destinationCiphertext: text("destination_ciphertext"),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  createdBy: uuid("created_by").references(() => users.id),
  initiatedBy: uuid("initiated_by").references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  executedBy: uuid("executed_by").references(() => users.id),
  idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull().default(sql`gen_random_uuid()::text`),
  providerReference: varchar("provider_reference", { length: 180 }),
  providerBatchId: varchar("provider_batch_id", { length: 180 }),
  providerTransactionId: varchar("provider_transaction_id", { length: 180 }),
  providerOutcome: varchar("provider_outcome", { length: 24 }),
  providerFeeKes: numeric("provider_fee_kes", { precision: 14, scale: 2 }),
  providerFeeVerifiedAt: timestamp("provider_fee_verified_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  providerConfirmedAt: timestamp("provider_confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("payout_request_status_idx").on(t.status, t.createdAt), uniqueIndex("payout_request_settlement_beneficiary_unique").on(t.settlementId, t.beneficiaryUserId), uniqueIndex("payout_request_idempotency_unique").on(t.idempotencyKey), check("payout_amount_positive", sql`${t.amountKes} > 0`)]);

export const refundRequests = pgTable("refund_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentTransactionId: uuid("payment_transaction_id").notNull().references(() => paymentTransactions.id),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  amountKes: numeric("amount_kes", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  destinationFingerprint: varchar("destination_fingerprint", { length: 128 }),
  status: varchar("status", { length: 24 }).notNull().default("requested"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  providerReference: varchar("provider_reference", { length: 180 }),
  providerConfirmedAt: timestamp("provider_confirmed_at", { withTimezone: true }),
  destinationType: varchar("destination_type", { length: 24 }).notNull().default("original_payer"),
  originalPayerFingerprint: varchar("original_payer_fingerprint", { length: 64 }),
  idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull().default(sql`gen_random_uuid()::text`),
  providerBatchId: varchar("provider_batch_id", { length: 180 }),
  providerTransactionId: varchar("provider_transaction_id", { length: 180 }),
  providerOutcome: varchar("provider_outcome", { length: 24 }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  executedBy: uuid("executed_by").references(() => users.id),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  reconciliationEvidenceRef: text("reconciliation_evidence_ref"),
  reconciliationNote: text("reconciliation_note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("refund_request_status_idx").on(t.status, t.createdAt), uniqueIndex("refund_request_idempotency_unique").on(t.idempotencyKey), check("refund_amount_positive", sql`${t.amountKes} > 0`)]);

export const providerOperationOutbox = pgTable("provider_operation_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationType: varchar("operation_type", { length: 16 }).notNull(),
  resourceId: uuid("resource_id").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("reserved"),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  attemptCount: integer("attempt_count").notNull().default(0),
  providerReference: varchar("provider_reference", { length: 180 }),
  httpStatus: integer("http_status"),
  dispatchStartedAt: timestamp("dispatch_started_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("provider_operation_outbox_idempotency_unique").on(t.idempotencyKey),
  index("provider_operation_outbox_attention_idx").on(t.status, t.createdAt),
  check("provider_operation_outbox_type_check", sql`${t.operationType} in ('refund','payout')`),
  check("provider_operation_outbox_status_check", sql`${t.status} in ('reserved','dispatching','accepted','rejected','unknown','reconciled')`),
  check("provider_operation_outbox_attempt_count_check", sql`${t.attemptCount} >= 0`)]);

export const reconciliationItems = pgTable("reconciliation_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: varchar("source", { length: 32 }).notNull(),
  externalReference: varchar("external_reference", { length: 180 }).notNull(),
  internalReference: varchar("internal_reference", { length: 180 }),
  amountKes: numeric("amount_kes", { precision: 14, scale: 2 }).notNull(),
  varianceKes: numeric("variance_kes", { precision: 14, scale: 2 }).notNull().default("0"),
  expectedAmountKes: numeric("expected_amount_kes", { precision: 14, scale: 2 }),
  providerAmountKes: numeric("provider_amount_kes", { precision: 14, scale: 2 }),
  currency: varchar("currency", { length: 3 }).notNull().default("KES"),
  reasonCode: varchar("reason_code", { length: 64 }),
  status: varchar("status", { length: 24 }).notNull().default("unmatched"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  resolutionNote: text("resolution_note"),
  evidenceRef: text("evidence_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("reconciliation_status_idx").on(t.status, t.createdAt)]);

export const paymentReceipts = pgTable("payment_receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptNumber: varchar("receipt_number", { length: 48 }).notNull(),
  paymentTransactionId: uuid("payment_transaction_id").notNull().references(() => paymentTransactions.id),
  claimantId: uuid("claimant_id").notNull().references(() => users.id),
  amountKes: numeric("amount_kes", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KES"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  receiptKind: varchar("receipt_kind", { length: 32 }).notNull().default("payment_confirmation"),
  disclaimer: text("disclaimer").notNull()
}, t => [uniqueIndex("payment_receipt_number_unique").on(t.receiptNumber), uniqueIndex("payment_receipt_transaction_unique").on(t.paymentTransactionId)]);

export const communicationsTemplates = pgTable("communications_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 80 }).notNull(),
  channel: varchar("channel", { length: 24 }).notNull(),
  version: integer("version").notNull(),
  subject: varchar("subject", { length: 200 }),
  body: text("body").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("communications_template_version_unique").on(t.code, t.channel, t.version)]);

export const communicationsCampaigns = pgTable("communications_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id").references(() => reports.id),
  title: varchar("title", { length: 180 }).notNull(),
  purpose: varchar("purpose", { length: 80 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  withdrawnBy: uuid("withdrawn_by").references(() => users.id),
  withdrawalReason: varchar("withdrawal_reason", { length: 1000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("communications_campaign_status_idx").on(t.status, t.scheduledAt), index("communications_campaign_report_idx").on(t.reportId)]);

export const communicationsPublications = pgTable("communications_publications", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => communicationsCampaigns.id, { onDelete: "cascade" }),
  channel: varchar("channel", { length: 24 }).notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  externalReference: varchar("external_reference", { length: 180 }),
  attempts: integer("attempts").notNull().default(0),
  lastErrorCode: varchar("last_error_code", { length: 80 }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedBy: uuid("published_by").references(() => users.id),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  withdrawnBy: uuid("withdrawn_by").references(() => users.id),
  withdrawalReason: varchar("withdrawal_reason", { length: 1000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("communications_publication_status_idx").on(t.status, t.createdAt)]);

export const documentScanEvents = pgTable("document_scan_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  scanner: varchar("scanner", { length: 80 }).notNull(),
  result: varchar("result", { length: 24 }).notNull(),
  signature: varchar("signature", { length: 128 }),
  detailsCode: varchar("details_code", { length: 80 }),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("document_scan_doc_idx").on(t.documentId, t.scannedAt)]);

export const securityIncidents = pgTable("security_incidents", {
  id: uuid("id").defaultRandom().primaryKey(),
  reference: varchar("reference", { length: 24 }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull(),
  category: varchar("category", { length: 48 }).notNull(),
  summary: varchar("summary", { length: 240 }).notNull(),
  details: text("details").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("open"),
  ownerId: uuid("owner_id").references(() => users.id),
  reportedBy: uuid("reported_by").references(() => users.id),
  triagedBy: uuid("triaged_by").references(() => users.id),
  resolution: text("resolution"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true })
}, t => [uniqueIndex("security_incident_reference_unique").on(t.reference), index("security_incident_status_idx").on(t.status, t.severity)]);

export const privacyLegalHolds = pgTable("privacy_legal_holds", {
  id: uuid("id").defaultRandom().primaryKey(),
  reference: varchar("reference", { length: 32 }).notNull(),
  subjectType: varchar("subject_type", { length: 60 }).notNull(),
  subjectId: varchar("subject_id", { length: 120 }).notNull(),
  reasonCode: varchar("reason_code", { length: 60 }).notNull(),
  authorityReference: varchar("authority_reference", { length: 180 }),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  releasedBy: uuid("released_by").references(() => users.id),
  releaseReason: varchar("release_reason", { length: 1000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp("released_at", { withTimezone: true })
}, t => [uniqueIndex("privacy_legal_hold_reference_unique").on(t.reference), index("privacy_legal_hold_subject_idx").on(t.subjectType, t.subjectId, t.status)]);

export const privacyRetentionPolicies = pgTable("privacy_retention_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  recordClass: varchar("record_class", { length: 80 }).notNull(),
  purpose: varchar("purpose", { length: 500 }).notNull(),
  retentionDays: integer("retention_days").notNull(),
  legalBasisReview: varchar("legal_basis_review", { length: 24 }).notNull().default("pending"),
  policyVersion: varchar("policy_version", { length: 40 }).notNull(),
  active: boolean("active").notNull().default(false),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("privacy_retention_class_version_unique").on(t.recordClass, t.policyVersion), check("privacy_retention_days_positive", sql`${t.retentionDays} > 0`)]);

export const riskReviewCases = pgTable("risk_review_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  reference: varchar("reference", { length: 32 }).notNull(),
  subjectUserId: uuid("subject_user_id").references(() => users.id),
  subjectType: varchar("subject_type", { length: 60 }).notNull(),
  subjectId: varchar("subject_id", { length: 120 }).notNull(),
  signalCode: varchar("signal_code", { length: 80 }).notNull(),
  signalSource: varchar("signal_source", { length: 80 }).notNull(),
  signalEvidenceHash: varchar("signal_evidence_hash", { length: 64 }),
  severity: varchar("severity", { length: 16 }).notNull().default("low"),
  status: varchar("status", { length: 24 }).notNull().default("open"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  outcome: varchar("outcome", { length: 32 }),
  rationale: varchar("rationale", { length: 1500 }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
}, t => [uniqueIndex("risk_review_reference_unique").on(t.reference), index("risk_review_status_idx").on(t.status, t.severity, t.createdAt), index("risk_review_subject_idx").on(t.subjectType, t.subjectId)]);

export const riskReviewEvents = pgTable("risk_review_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull().references(() => riskReviewCases.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  rationale: varchar("rationale", { length: 1500 }).notNull(),
  evidenceHash: varchar("evidence_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("risk_review_event_case_idx").on(t.caseId, t.createdAt)]);

export const documentAccessEvents = pgTable("document_access_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  accessPurpose: varchar("access_purpose", { length: 80 }).notNull(),
  outcome: varchar("outcome", { length: 24 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("document_access_document_idx").on(t.documentId, t.createdAt), index("document_access_actor_idx").on(t.actorId, t.createdAt)]);

export const securityIncidentAssessments = pgTable("security_incident_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  incidentId: uuid("incident_id").notNull().references(() => securityIncidents.id),
  assessedBy: uuid("assessed_by").notNull().references(() => users.id),
  affectedDataClasses: jsonb("affected_data_classes").$type<string[]>().notNull().default([]),
  affectedPeopleEstimate: integer("affected_people_estimate"),
  accessConfirmed: boolean("access_confirmed").notNull().default(false),
  containmentAt: timestamp("containment_at", { withTimezone: true }),
  counselReviewStatus: varchar("counsel_review_status", { length: 24 }).notNull().default("pending"),
  regulatorAssessmentStatus: varchar("regulator_assessment_status", { length: 24 }).notNull().default("pending"),
  subjectNotificationStatus: varchar("subject_notification_status", { length: 24 }).notNull().default("pending"),
  assessmentNotes: varchar("assessment_notes", { length: 3000 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("security_incident_assessment_idx").on(t.incidentId, t.createdAt), check("security_incident_people_nonnegative", sql`${t.affectedPeopleEstimate} is null or ${t.affectedPeopleEstimate} >= 0`)]);

export const policyVersions = pgTable("policy_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  policyCode: varchar("policy_code", { length: 80 }).notNull(),
  version: varchar("version", { length: 40 }).notNull(),
  contentHash: varchar("content_hash", { length: 128 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [uniqueIndex("policy_version_unique").on(t.policyCode, t.version)]);

export const categoryProposals = pgTable("category_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposedName: varchar("proposed_name", { length: 100 }).notNull(),
  explanation: text("explanation").notNull(),
  proposedBy: uuid("proposed_by").references(() => users.id),
  proposedEmail: varchar("proposed_email", { length: 320 }),
  reportId: uuid("report_id").references(() => reports.id),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewReasonCode: varchar("review_reason_code", { length: 48 }),
  reviewNote: varchar("review_note", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, t => [index("category_proposal_status_idx").on(t.status, t.createdAt)]);


export const runtimeWorkerHeartbeats = pgTable("runtime_worker_heartbeats", {
  workerName: varchar("worker_name", { length: 100 }).primaryKey(),
  status: varchar("status", { length: 24 }).notNull().default("idle"),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
  lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastErrorCode: varchar("last_error_code", { length: 80 }),
  successfulRuns: bigint("successful_runs", { mode: "number" }).notNull().default(0),
  failedRuns: bigint("failed_runs", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, t => [check("runtime_worker_status_check", sql`${t.status} in ('idle','running','healthy','degraded')`)]);
