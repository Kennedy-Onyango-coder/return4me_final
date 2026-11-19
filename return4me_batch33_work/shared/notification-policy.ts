export const MAX_NOTIFICATION_ATTEMPTS = 8;
export function notificationRetryDelaySeconds(previousAttempts: number): number {
  const exponent = Math.max(0, Math.min(9, Math.floor(previousAttempts)));
  return Math.min(21_600, 30 * (2 ** exponent));
}
export function notificationShouldDeadLetter(nextAttemptCount: number): boolean {
  return nextAttemptCount >= MAX_NOTIFICATION_ATTEMPTS;
}
