import { Router } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { auditEvents, communicationConsents, notificationPreferences, notifications } from "../db/schema.js";
import { authenticate } from "../security.js";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

async function ensurePreferences(userId: string) {
  await db.insert(notificationPreferences).values({ userId }).onConflictDoNothing();
  const [row] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  return row;
}

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const rows = await db.select({ id: notifications.id, type: notifications.type, category: notifications.category,
      priority: notifications.priority, title: notifications.title, body: notifications.body, link: notifications.link,
      readAt: notifications.readAt, createdAt: notifications.createdAt })
      .from(notifications).where(eq(notifications.userId, req.auth!.id)).orderBy(desc(notifications.createdAt)).limit(100);
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = new Date(row.createdAt).toISOString().slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    res.json({ notifications: rows, groups: [...groups.entries()].map(([date, items]) => ({ date, notifications: items })) });
  } catch (e) { next(e); }
});

notificationsRouter.get("/preferences", async (req, res, next) => {
  try {
    const preferences = await ensurePreferences(req.auth!.id);
    const [emailConsent] = await db.select({ id: communicationConsents.id }).from(communicationConsents)
      .where(and(eq(communicationConsents.userId, req.auth!.id), eq(communicationConsents.channel, "email"),
        eq(communicationConsents.purpose, "community_updates"), eq(communicationConsents.status, "granted"))).limit(1);
    res.json({ preferences: { inAppCommunityUpdates: preferences.inAppCommunityUpdates,
      emailCommunityUpdates: preferences.emailCommunityUpdates && Boolean(emailConsent),
      smsCommunityUpdates: false, criticalSecurityInApp: true, criticalFinancialInApp: true,
      smsEnabled: false } });
  } catch (e) { next(e); }
});

notificationsRouter.patch("/preferences", async (req, res, next) => {
  try {
    const parsed = z.object({ inAppCommunityUpdates: z.boolean().optional(), emailCommunityUpdates: z.boolean().optional() })
      .strict().safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: "Provide supported notification preferences" });
    if (parsed.data.emailCommunityUpdates === true) {
      const [consent] = await db.select({ id: communicationConsents.id }).from(communicationConsents)
        .where(and(eq(communicationConsents.userId, req.auth!.id), eq(communicationConsents.channel, "email"),
          eq(communicationConsents.purpose, "community_updates"), eq(communicationConsents.status, "granted"))).limit(1);
      if (!consent) return res.status(409).json({ error: "Explicit email consent is required before enabling community update emails" });
    }
    await ensurePreferences(req.auth!.id);
    const [updated] = await db.update(notificationPreferences).set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, req.auth!.id)).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "notifications.preferences_updated",
      resourceType: "notification_preferences", resourceId: req.auth!.id, outcome: "success",
      metadata: { changedFields: Object.keys(parsed.data), criticalChannelsRemainEnabled: true } });
    res.json({ preferences: { inAppCommunityUpdates: updated.inAppCommunityUpdates,
      emailCommunityUpdates: updated.emailCommunityUpdates, smsCommunityUpdates: false,
      criticalSecurityInApp: true, criticalFinancialInApp: true, smsEnabled: false } });
  } catch (e) { next(e); }
});

notificationsRouter.get("/unread-count", async (req, res, next) => {
  try {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications)
      .where(and(eq(notifications.userId, req.auth!.id), isNull(notifications.readAt)));
    res.json({ unreadCount: row?.count ?? 0 });
  } catch (e) { next(e); }
});

notificationsRouter.patch("/read-all", async (req, res, next) => {
  try {
    const result = await db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.userId, req.auth!.id), isNull(notifications.readAt))).returning({ id: notifications.id });
    res.json({ markedRead: result.length });
  } catch (e) { next(e); }
});

notificationsRouter.patch("/:id/read", async (req, res, next) => {
  try {
    const [updated] = await db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.auth!.id))).returning({ id: notifications.id });
    if (!updated) return res.status(404).json({ error: "Notification not found" });
    res.json({ success: true });
  } catch (e) { next(e); }
});
