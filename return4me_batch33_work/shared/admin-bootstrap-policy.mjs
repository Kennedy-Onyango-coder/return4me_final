/** Policy for the one-time Owner bootstrap and subsequent Admin provisioning. */
export function canBootstrapOwner({ targetEmail, configuredEmail, activeOwnerCount }) {
  const target = typeof targetEmail === "string" ? targetEmail.trim().toLowerCase() : "";
  const configured = typeof configuredEmail === "string" ? configuredEmail.trim().toLowerCase() : "";
  return Boolean(target && configured && target === configured && Number.isInteger(activeOwnerCount) && activeOwnerCount === 0);
}

