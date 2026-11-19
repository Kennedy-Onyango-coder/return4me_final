import { Resend } from "resend";

export async function sendOtpEmail(email: string, code: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured");
    console.info(`[DEV ONLY] Return4me OTP for ${email}: ${code}`);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM, to: email,
    subject: "Your Return4me verification code",
    html: `<div style="font-family:Arial,sans-serif"><h2>Verify your email</h2><p>Your one-time code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires shortly. Do not share it with anyone.</p></div>`
  });
  if (result.error) throw new Error("Email delivery failed");
}

function htmlSafe(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export async function sendOrganisationInvitation(email: string, organisationName: string, inviteUrl: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured");
    console.info(`[DEV ONLY] Return4me organisation invitation for ${email}: ${inviteUrl}`);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `Invitation to ${organisationName} on Return4me`,
    html: `<div style="font-family:Arial,sans-serif"><h2>Organisation invitation</h2><p>You have been invited to join <strong>${htmlSafe(organisationName)}</strong> on Return4me.</p><p><a href="${htmlSafe(inviteUrl)}">Review invitation</a></p><p>This invitation expires in seven days. Do not forward the link.</p></div>`
  });
  if (result.error) throw new Error("Invitation email delivery failed");
}

export async function sendFinderDropoffInstructions(input: { email: string; reference: string; businessName: string; county: string; servicePhone: string | null; code: string }) {
  const subject = `Return4me agent drop-off instructions for ${input.reference}`;
  const contact = input.servicePhone ? `<p>Verified agent service number: <strong>${htmlSafe(input.servicePhone)}</strong></p>` : "<p>Contact the Return4me support channel for drop-off coordination. Do not arrange a private meeting.</p>";
  const html = `<div style="font-family:Arial,sans-serif"><h2>Authorised agent assignment</h2><p>Your found-item report ${htmlSafe(input.reference)} has an assigned agent: <strong>${htmlSafe(input.businessName)}</strong> (${htmlSafe(input.county)} County).</p>${contact}<p>Show this one-time drop-off code to the assigned agent in person:</p><p style="font-size:30px;font-weight:bold;letter-spacing:7px">${htmlSafe(input.code)}</p><p>The code expires in 24 hours. Do not share it with anyone else. Do not hand the item to an unassigned person or meet privately outside the approved service location.</p></div>`;
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured");
    console.info(`[DEV ONLY] Return4me drop-off code for ${input.email} (${input.reference}): ${input.code}`);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({ from: process.env.EMAIL_FROM, to: input.email, subject, html });
  if (result.error) throw new Error("Drop-off instructions could not be delivered");
}

export async function sendGuestReportTrackingLink(input: { email: string; reference: string; trackingUrl: string }) {
  const subject = `Your Return4me report tracking link (${input.reference})`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Your report has been received</h2><p>Reference: <strong>${htmlSafe(input.reference)}</strong></p><p>Use the secure link below to check limited progress information about your report. It is valid for 30 days.</p><p><a href="${htmlSafe(input.trackingUrl)}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">View report status</a></p><p>This link is personal. Do not forward it. It does not authorise an item collection or prove ownership.</p><p>Return4me will never ask you to share a one-time code or password.</p></div>`;
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured");
    console.info(`[DEV ONLY] Return4me guest tracking link for ${input.reference}: ${input.trackingUrl}`);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({ from: process.env.EMAIL_FROM, to: input.email, subject, html });
  if (result.error) throw new Error("Guest report tracking email delivery failed");
}

export async function sendGuestReportStatusEmail(input: { email: string; reference: string; status: string }) {
  const safeStatus = htmlSafe(input.status.replaceAll("_", " "));
  const html = `<div style="font-family:Arial,sans-serif"><h2>Return4me report update</h2><p>There is an update for report <strong>${htmlSafe(input.reference)}</strong>.</p><p>Current status: <strong>${safeStatus}</strong>.</p><p>Use the secure tracking link previously sent to you for limited progress information. This email does not authorise an item collection or prove ownership.</p></div>`;
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured");
    console.info(`[DEV ONLY] Return4me guest report status update ${input.reference}: ${input.status}`);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({ from: process.env.EMAIL_FROM, to: input.email, subject: `Return4me report update (${input.reference})`, html });
  if (result.error) throw new Error("Guest report update email delivery failed");
}

export async function sendClaimantCollectionCode(input: { email: string; reference: string; code: string }): Promise<"email" | "development_log"> {
  const html = `<div style="font-family:Arial,sans-serif"><h2>Return4me collection authorisation</h2><p>Your approved claim for report <strong>${htmlSafe(input.reference)}</strong> has passed the recorded identity and authority checks.</p><p>Show this one-time collection code to the assigned Agent at the approved service location:</p><p style="font-size:30px;font-weight:bold;letter-spacing:7px">${htmlSafe(input.code)}</p><p>The code expires in 24 hours, allows five attempts and can be used once. Do not share it with anyone before you are physically present with the assigned Agent.</p><p>This code does not bypass the platform's payment, legal or final-release checks.</p></div>`;
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured");
    console.info(`[DEV ONLY] Return4me collection code for ${input.email} (${input.reference}): ${input.code}`);
    return "development_log";
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({ from: process.env.EMAIL_FROM, to: input.email, subject: `Return4me collection code (${input.reference})`, html });
  if (result.error) throw new Error("Collection-code delivery failed");
  return "email";
}
