export function adminGrantDenial(input: { actorId?: string; targetId?: string; verified?: boolean; suspended?: boolean; roles?: string[] }): string | null;
export function adminRevokeDenial(input: { actorId?: string; targetId?: string; roles?: string[] }): string | null;
