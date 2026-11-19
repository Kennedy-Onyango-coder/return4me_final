-- Batch 12: controlled category review reason and note for proposer notifications.
ALTER TABLE category_proposals
  ADD COLUMN IF NOT EXISTS review_reason_code varchar(48),
  ADD COLUMN IF NOT EXISTS review_note varchar(500);
