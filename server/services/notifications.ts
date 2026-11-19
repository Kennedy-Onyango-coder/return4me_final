import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { notificationOutbox, notificationPreferences } from "../db/schema.js";

export type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  category?: "service" | "security" | "financial" | "community";
  priority?: "critical" | "high" | "normal";
  /** Stable business-event key. Repeated enqueue attempts with this key are suppressed. */
  dedupeKey?: string | null;
};

function safeInternalLink(value?: string | null) {
  if (!value) return null;
  // Notifications may only deep-link within the application. Reject protocol-relative,
  // absolute, control-character and javascript/data URLs before they reach the client.
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const parsed = new URL(value, "https://return4me.invalid");
    if (parsed.origin !== "https://return4me.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 500);
  } catch { return null; }
}

/** Queue an in-app notification after the primary transaction has committed. */
export async function enqueueNotification(input: NotificationInput) {
  const category = input.category ?? "service";
  const priority = category === "security" || category === "financial" ? "critical" : (input.priority ?? "normal");
  if (category === "community") {
    const [preferences] = await db.select({ enabled: notificationPreferences.inAppCommunityUpdates })
      .from(notificationPreferences).where(eq(notificationPreferences.userId, input.userId)).limit(1);
    if (preferences && !preferences.enabled) return;
  }
  await db.insert(notificationOutbox).values({
    userId: input.userId,
    type: input.type.slice(0, 60),
    title: input.title.slice(0, 180),
    body: input.body.slice(0, 4000),
    link: safeInternalLink(input.link),
    category,
    priority,
    dedupeKey: input.dedupeKey?.slice(0, 180) ?? null,
    status: "pending"
  }).onConflictDoNothing();
}

export function notifySafely(input: NotificationInput) {
  void enqueueNotification(input).catch(() => {
    // The primary decision remains committed. Durable entries retry; enqueue failures
    // are deliberately surfaced without logging recipient data or message contents.
    console.warn("Notification enqueue failed; primary action was not rolled back");
  });
}
