import { pool } from "../db/index.js";

/**
 * Automatic 48-hour settlement approval only. This worker never creates a
 * payout request, calls IntaSend, reads wallet balances or moves money.
 * Payout remains a separate manually initiated, independently approved action.
 */
export async function autoApproveDueSettlements(): Promise<number> {
  const result = await pool.query(`WITH due AS (
      UPDATE settlements s SET status='approved',approved_at=now(),approved_by=NULL,approval_mode='automatic_48h'
      FROM claims c
      WHERE c.id=s.claim_id AND c.status='completed' AND s.status='eligible' AND s.settle_at IS NOT NULL AND s.settle_at<=now()
        AND NOT EXISTS(SELECT 1 FROM case_disputes d WHERE d.claim_id=c.id AND d.settlement_hold=true AND d.status NOT IN ('resolved','closed','dismissed'))
      RETURNING s.id,s.claim_id
    )
    INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata)
      SELECT NULL,'finance.settlement_auto_approved','settlement',due.id,'success',jsonb_build_object('policy','48_hour_eligibility','payoutInitiated',false)
      FROM due RETURNING resource_id`);
  return result.rowCount ?? 0;
}
