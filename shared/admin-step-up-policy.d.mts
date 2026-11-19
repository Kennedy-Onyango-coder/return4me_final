export function isSupportedStepUpPurpose(value: unknown): boolean;
export function reportStatusStepUpPurpose(status: unknown): string | null;
export function stepUpGrantIsUsable(grant: {userId:string;sessionId:string;purpose:string;expiresAt:string|Date;consumedAt?:string|Date|null}|null, context: {userId:string;sessionId:string;purpose:string}|null, now?: Date): boolean;
