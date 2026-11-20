import { Resend } from "resend";

const EMAIL_TEMPLATE_VERSION = "2026-11-v1";

function htmlSafe(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function safeActionUrl(value: string) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Email action URL is invalid"); }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname)))
    throw new Error("Email action URL must use HTTPS");
  return parsed.toString();
}

/** Shared, responsive Return4me email shell. Transactional templates are versioned in source. */
function renderBrandedEmail(templateCode: string, heading: string, content: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${htmlSafe(heading)}</title></head><body style="margin:0;padding:24px 12px;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#142033"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #e4e9f1;border-radius:14px;overflow:hidden"><tr><td style="padding:20px 24px;background:#ffffff;border-bottom:4px solid #101c32"><img src="https://return4me.co.ke/assets/logo_wordmark_transparent.png" width="190" alt="Return4me" style="display:block;width:190px;max-width:100%;height:auto;border:0"><div style="margin-top:8px;font-size:12px;color:#475569">Find your way back.</div></td></tr><tr><td style="padding:28px 24px"><h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#142033">${htmlSafe(heading)}</h1><div style="font-size:15px;line-height:1.65;color:#334155">${content}</div></td></tr><tr><td style="padding:16px 24px;border-top:1px solid #e8edf4;font-size:11px;line-height:1.5;color:#64748b">Elligrace Technologies Limited · Return4me<br>Template ${htmlSafe(templateCode)} · ${EMAIL_TEMPLATE_VERSION}<br>Recovery is coordinated but cannot be guaranteed. Never share your password or one-time code.</td></tr></table></td></tr></table></body></html>`;
}

async function deliverEmail(input: { to: string; subject: string; templateCode: string; heading: string; content: string }) {
  const html = renderBrandedEmail(input.templateCode, input.heading, input.content);
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured");
    console.info(`[DEV ONLY] Return4me email template ${input.templateCode} prepared for ${input.to}`);
    return "development_log" as const;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({ from: process.env.EMAIL_FROM, to: input.to, subject: input.subject, html });
  if (result.error) throw new Error("Email delivery failed");
  return "email" as const;
}

export async function sendOtpEmail(email: string, code: string) {
  if ((!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) && process.env.NODE_ENV !== "production") {
    console.info(`[DEV ONLY] Return4me OTP for ${email}: ${code}`);
    return;
  }
  await deliverEmail({ to: email, subject: "Your Return4me verification code", templateCode: "account-otp", heading: "Verify your email",
    content: `<p>Your one-time verification code is:</p><p style="font-size:30px;font-weight:700;letter-spacing:7px;color:#101c32">${htmlSafe(code)}</p><p>This code expires shortly, allows a limited number of attempts and can be used once. Do not share it with anyone.</p>` });
}

export async function sendOrganisationInvitation(email: string, organisationName: string, inviteUrl: string) {
  const safeUrl = htmlSafe(safeActionUrl(inviteUrl));
  await deliverEmail({ to: email, subject: `Invitation to ${organisationName} on Return4me`, templateCode: "organisation-invitation", heading: "Organisation invitation",
    content: `<p>You have been invited to join <strong>${htmlSafe(organisationName)}</strong> on Return4me.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px">Review invitation</a></p><p>This invitation expires in seven days. Do not forward the link.</p>` });
}

export async function sendFinderDropoffInstructions(input: { email: string; reference: string; businessName: string; county: string; servicePhone: string | null; code: string }) {
  if ((!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) && process.env.NODE_ENV !== "production") {
    console.info(`[DEV ONLY] Return4me drop-off code for ${input.email} (${input.reference}): ${input.code}`);
    return;
  }
  const contact = input.servicePhone ? `<p>Verified Agent service number: <strong>${htmlSafe(input.servicePhone)}</strong></p>` : "<p>Contact the Return4me support channel for drop-off coordination. Do not arrange a private meeting.</p>";
  await deliverEmail({ to: input.email, subject: `Return4me Agent drop-off instructions for ${input.reference}`, templateCode: "finder-dropoff", heading: "Authorised Agent assignment",
    content: `<p>Your found-item report ${htmlSafe(input.reference)} has an assigned Agent: <strong>${htmlSafe(input.businessName)}</strong> (${htmlSafe(input.county)} County).</p>${contact}<p>Show this one-time drop-off code to the assigned Agent in person:</p><p style="font-size:30px;font-weight:700;letter-spacing:7px;color:#101c32">${htmlSafe(input.code)}</p><p>The code expires in 24 hours. Do not share it with anyone else. Do not hand the item to an unassigned person or meet privately outside the approved service location.</p>` });
}

export async function sendGuestReportTrackingLink(input: { email: string; reference: string; trackingUrl: string }) {
  const safeUrl = htmlSafe(safeActionUrl(input.trackingUrl));
  await deliverEmail({ to: input.email, subject: `Your Return4me report tracking link (${input.reference})`, templateCode: "guest-report-tracking", heading: "Your report has been received",
    content: `<p>Reference: <strong>${htmlSafe(input.reference)}</strong></p><p>Use the secure link below to check limited progress information about your report. It is valid for 30 days.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px">View report status</a></p><p>This link is personal. Do not forward it. It does not authorise an item collection or prove ownership.</p><p>Return4me will never ask you to share a one-time code or password.</p>` });
}

export async function sendGuestReportStatusEmail(input: { email: string; reference: string; status: string }) {
  const safeStatus = htmlSafe(input.status.replaceAll("_", " "));
  await deliverEmail({ to: input.email, subject: `Return4me report update (${input.reference})`, templateCode: "guest-report-status", heading: "Your report has been updated",
    content: `<p>There is an update for report <strong>${htmlSafe(input.reference)}</strong>.</p><p>Current status: <strong>${safeStatus}</strong>.</p><p>Use the secure tracking link previously sent to you for limited progress information. This email does not authorise an item collection or prove ownership.</p>` });
}

export async function sendClaimantCollectionCode(input: { email: string; reference: string; code: string }): Promise<"email" | "development_log"> {
  if ((!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) && process.env.NODE_ENV !== "production") {
    console.info(`[DEV ONLY] Return4me collection code for ${input.email} (${input.reference}): ${input.code}`);
    return "development_log";
  }
  return deliverEmail({ to: input.email, subject: `Return4me collection code (${input.reference})`, templateCode: "claimant-collection-code", heading: "Return4me collection authorisation",
    content: `<p>Your approved claim for report <strong>${htmlSafe(input.reference)}</strong> has passed the recorded identity and authority checks.</p><p>Show this one-time collection code to the assigned Agent at the approved service location:</p><p style="font-size:30px;font-weight:700;letter-spacing:7px;color:#101c32">${htmlSafe(input.code)}</p><p>The code expires in 24 hours, allows five attempts and can be used once. Do not share it with anyone before you are physically present with the assigned Agent.</p><p>This code does not bypass the platform's payment, legal or final-release checks.</p>` });
}
