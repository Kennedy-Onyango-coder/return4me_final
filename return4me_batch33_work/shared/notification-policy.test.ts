import { describe, expect, it } from "vitest";
import { MAX_NOTIFICATION_ATTEMPTS, notificationRetryDelaySeconds, notificationShouldDeadLetter } from "./notification-policy.js";

describe("notification outbox retry policy", () => {
  it("uses bounded exponential backoff", () => {
    expect(notificationRetryDelaySeconds(0)).toBe(30);
    expect(notificationRetryDelaySeconds(1)).toBe(60);
    expect(notificationRetryDelaySeconds(4)).toBe(480);
    expect(notificationRetryDelaySeconds(9)).toBe(15360);
    expect(notificationRetryDelaySeconds(20)).toBe(15360);
  });
  it("dead-letters after the configured maximum attempts", () => {
    expect(notificationShouldDeadLetter(MAX_NOTIFICATION_ATTEMPTS - 1)).toBe(false);
    expect(notificationShouldDeadLetter(MAX_NOTIFICATION_ATTEMPTS)).toBe(true);
  });
});
