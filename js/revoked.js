// Invite revocation list. Each entry is an invite's `jti` (its short id,
// shown in the Admin area). A revoked invite fails the gate for everyone
// once this file is deployed. The admin can also revoke locally for instant
// effect on their own device; global enforcement happens on the next deploy.
//
// To revoke globally: add the jti string(s) below and redeploy.
export const REVOKED = [
  // "abc12345",
];
