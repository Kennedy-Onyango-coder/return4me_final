import { db } from "../db/index.js";
import { notificationOutbox } from "../db/schema.js";

export type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
};

/** Queue an in-app notification after the primary transaction has committed. */
export async function enqueueNotification(input: NotificationInput) {
  await db.insert(notificationOutbox).values({
    userId: input.userId,
    type: input.type.slice(0, 60),
    title: input.title.slice(0, 180),
    body: input.body.slice(0, 4000),
    link: input.link ?? null,
    status: "pending"
  });
}

export function notifySafely(input: NotificationInput) {
  void enqueueNotification(input).catch(() => {
    // The outbox worker retries durable entries. If the enqueue itself fails,
    // the primary decision remains committed and the failure is observable.
    console.warn("Notification enqueue failed; primary action was not rolled back");
  });
}
