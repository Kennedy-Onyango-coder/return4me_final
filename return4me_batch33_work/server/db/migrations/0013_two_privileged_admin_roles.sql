-- Batch 27: consolidate all legacy delegated administrator scopes into Admin.
-- Owner remains the single highest authority. Customer, Finder, Agent and
-- organisation roles are untouched. This migration is NOT applied by this build.
BEGIN;

-- Ensure each user holding a legacy admin-scope role also has the canonical
-- Admin role before revoking the legacy scope rows. NOT EXISTS avoids the
-- partial unique-index conflict for users who already hold Admin.
INSERT INTO user_roles (user_id, role, granted_by, granted_at)
SELECT DISTINCT legacy.user_id, 'admin'::user_role, NULL, now()
FROM user_roles legacy
WHERE legacy.revoked_at IS NULL
  AND legacy.role IN ('finance', 'trust_safety', 'communications_writer',
                      'communications_approver', 'communications_publisher', 'support')
  AND NOT EXISTS (
    SELECT 1 FROM user_roles current_admin
    WHERE current_admin.user_id = legacy.user_id
      AND current_admin.role IN ('admin'::user_role, 'owner'::user_role)
      AND current_admin.revoked_at IS NULL
  );

UPDATE user_roles
SET revoked_at = now()
WHERE revoked_at IS NULL
  AND role IN ('finance', 'trust_safety', 'communications_writer',
               'communications_approver', 'communications_publisher', 'support');

COMMIT;

-- A person holds either Admin or Super Admin (Owner), never both.
UPDATE user_roles admin_role
SET revoked_at = now()
WHERE admin_role.revoked_at IS NULL
  AND admin_role.role = 'admin'::user_role
  AND EXISTS (
    SELECT 1 FROM user_roles owner_role
    WHERE owner_role.user_id = admin_role.user_id
      AND owner_role.role = 'owner'::user_role
      AND owner_role.revoked_at IS NULL
  );
