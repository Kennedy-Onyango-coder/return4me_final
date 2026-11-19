import { Router } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { authenticate } from "../security.js";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const rows = await db.select({ id: notifications.id, type: notifications.type, title: notifications.title,
      body: notifications.body, link: notifications.link, readAt: notifications.readAt, createdAt: notifications.createdAt })
      .from(notifications).where(eq(notifications.userId, req.auth!.id)).orderBy(desc(notifications.createdAt)).limit(100);
    res.json({ notifications: rows });
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
