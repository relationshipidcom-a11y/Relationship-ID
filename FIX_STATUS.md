# Relationship ID — Fix Status

## Fixed in this package

- Removed fake email/register backend authentication.
- Replaced hard-coded Google login with Firebase Google Auth.
- Added Firebase password reset and persistent session selection.
- Added sign out.
- Added real Firebase phone verification/OTP component.
- Added country code before P1 and P2 mobile fields.
- Added E.164 phone normalization.
- Added country code support for Partner 2 invitation mobile/WhatsApp.
- Added Relationship Start Date to P1.
- Added 18+ validation.
- Removed prefilled demo users from the normal flow.
- Enforced same-as-verified-mobile WhatsApp trust rule.
- Different WhatsApp remains unverified without genuine WhatsApp provider proof.
- Removed fake invitation fallback for unknown invitation links.
- Added secure random invitation IDs.
- Added 3-day invitation expiration checks.
- Added authenticated P1 invitation creation/cancellation.
- Added authenticated P2 identity checks and real verified-phone requirement on acceptance.
- P2 no longer marks relationship active before backend success.
- Removed redundant P2 review step from the acceptance path.
- Certificate reference is generated only after acceptance.
- Added real QR rendering.
- Public verification now uses backend lookup and public-safe fields.
- Removed DOB from certificate/review preview.
- Removed misleading government/legal certification wording in user-facing copy.
- Added current-state routing after login (draft/pending/active).
- Added exact AI Studio setup/test instructions.

## Intentionally not claimed complete

- Relationship/invitation persistence is memory-backed for current AI Studio testing and clears when the server restarts.
- Firestore durable persistence is still required before production deployment.
- Real Google sign-in and real SMS OTP require the new Firebase project/provider/authorized-domain configuration and must be manually live-tested in AI Studio/browser.
- Real verification of a different WhatsApp number requires a genuine WhatsApp provider; this package does not fake it.
- Full lifecycle features (Take a Break, stage-change approval, End Relationship, account deletion retention workflow) are not implemented in this test build unless present elsewhere in the source; they remain later checkpoints.

## Deployment

NOT DEPLOYED — MANUAL DEPLOYMENT REQUIRED.
