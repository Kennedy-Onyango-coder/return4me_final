import type { Role } from "../../shared/contracts";

export type DemoTask = {
  id: string;
  title: string;
  detail: string;
  status: "Needs attention" | "In progress" | "Waiting" | "Completed";
  priority: "High" | "Normal" | "Low";
};

export type DemoCase = {
  reference: string;
  title: string;
  county: string;
  stage: string;
  updated: string;
};

export const DEMO_ROLES: { role: Role; label: string; description: string }[] = [
  { role: "claimant", label: "Claimant", description: "Track lost reports, claims and recovery steps." },
  { role: "finder", label: "Finder", description: "Review found reports, coordination and illustrative rewards." },
  { role: "agent", label: "Authorised Agent", description: "Preview assignments, custody and collection queues." },
  { role: "organisation", label: "Organisation", description: "Preview organisation cases and member access." },
  { role: "admin", label: "Admin", description: "Manage day-to-day operations across reports, claims, agents, finance, support, communications and safety queues." },
  { role: "owner", label: "Super Admin (Owner)", description: "Final platform authority with full administrative access and final approval responsibility." },
];

export const DEMO_CASES: DemoCase[] = [
  { reference: "R4M-DEMO-1042", title: "Black backpack · Personal belongings", county: "Nairobi", stage: "Under review", updated: "Today, 10:42" },
  { reference: "R4M-DEMO-1038", title: "Found smartphone · Electronics", county: "Kiambu", stage: "Authorised custody", updated: "Today, 09:18" },
  { reference: "R4M-DEMO-1026", title: "School bag · School and work", county: "Mombasa", stage: "Claim submitted", updated: "Yesterday" },
  { reference: "R4M-DEMO-1019", title: "Small travel case · Personal belongings", county: "Nakuru", stage: "Closed in demo", updated: "10 Nov 2026" },
];

export const DEMO_TASKS: Record<Role, DemoTask[]> = {
  claimant: [
    { id: "c1", title: "Add ownership details", detail: "Provide private details that only an authorised reviewer can inspect.", status: "Needs attention", priority: "High" },
    { id: "c2", title: "Review your case timeline", detail: "Check the latest report and claim events.", status: "In progress", priority: "Normal" },
    { id: "c3", title: "Confirm your contact email", detail: "Email verification is required for real submissions.", status: "Completed", priority: "Low" },
  ],
  finder: [
    { id: "f1", title: "Follow assigned-agent drop-off instructions", detail: "A real item must only be handed to an assigned, authorised agent.", status: "Needs attention", priority: "High" },
    { id: "f2", title: "Review your found report", detail: "Keep private identifiers out of public notice text.", status: "In progress", priority: "Normal" },
    { id: "f3", title: "Check reward allocation explanation", detail: "Illustrative only; no reward is payable in this demo.", status: "Waiting", priority: "Low" },
  ],
  agent: [
    { id: "a1", title: "Confirm custody checklist", detail: "Inspect and record the item before accepting physical custody.", status: "Needs attention", priority: "High" },
    { id: "a2", title: "Review approved service location", detail: "Collections must take place at an approved service location.", status: "In progress", priority: "Normal" },
    { id: "a3", title: "Complete refresher training", detail: "Training completion is required before activation in production.", status: "Waiting", priority: "Normal" },
  ],
  organisation: [
    { id: "o1", title: "Invite a staff member", detail: "Each staff member needs an individual account and assigned permissions.", status: "Needs attention", priority: "Normal" },
    { id: "o2", title: "Review organisation case access", detail: "Members should only access authorised organisation records.", status: "In progress", priority: "High" },
  ],
  admin: [
    { id: "ad1", title: "Review new reports", detail: "Check completeness, privacy and eligibility before publication.", status: "Needs attention", priority: "High" },
    { id: "ad2", title: "Review agent applications and documents", detail: "Verify identity, facilities, training and agreement status.", status: "Needs attention", priority: "High" },
    { id: "ad3", title: "Resolve claims, disputes and appeals", detail: "Use documented evidence, independent review and applicable holds.", status: "In progress", priority: "High" },
    { id: "ad4", title: "Review finance and reconciliation exceptions", detail: "Never initiate provider money movement outside separately authorised controls.", status: "Needs attention", priority: "High" },
    { id: "ad5", title: "Manage support and communications queues", detail: "Use approved, privacy-screened content and authorised case information.", status: "In progress", priority: "Normal" },
    { id: "ad6", title: "Review safety and governance escalations", detail: "Preserve evidence, apply holds and escalate consequential decisions for approval.", status: "Waiting", priority: "High" },
  ],
  owner: [
    { id: "ow1", title: "Review and decide pending Admin proposals", detail: "The Owner is the final authority and may approve or reject Admin proposals.", status: "Needs attention", priority: "High" },
    { id: "ow2", title: "Exercise final approval authority", detail: "Owner decisions remain authenticated, reasoned and fully audited.", status: "In progress", priority: "High" },
    { id: "ow3", title: "Review governance and service coverage", detail: "Confirm evidence before declaring coverage, compliance or financial readiness.", status: "Waiting", priority: "Normal" },
  ],
};

export const DEMO_NOTIFICATIONS = [
  { id: "n1", title: "Case review updated", body: "A demonstration report moved to the review queue.", time: "10:42" },
  { id: "n2", title: "Privacy reminder", body: "Never share full identity numbers or private evidence in public notices.", time: "Yesterday" },
  { id: "n3", title: "Service process", body: "Return4me coordinates recovery; successful recovery is not guaranteed.", time: "10 Nov" },
];
