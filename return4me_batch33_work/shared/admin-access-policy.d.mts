export type AdminCapability = {
  capability: string;
  label: string;
  dataClass: string;
  permitted: boolean;
  ownerAllowed: boolean;
};
export function getAdminCapabilityMatrix(roles?: string[]): AdminCapability[];
export function canAccessAdminCapability(capability: string, roles?: string[]): boolean;
