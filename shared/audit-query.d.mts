export interface AuditQueryValue { limit:number; offset:number; action:string; resourceType:string; outcome:string; from:Date|null; to:Date|null; }
export type AuditQueryResult = {ok:true;value:AuditQueryValue}|{ok:false;error:string};
export function parseAuditQuery(query:Record<string,unknown>):AuditQueryResult;
