# Relationship ID — Fix Status

## Fixed in this package

- Removed fake email/register backend authentication.
- Replaced hard-coded Google login with Firebase Google Auth.
- Added Firebase password reset and persistent session selection.
- Added sign out.
- Added real Firebase phone verification/OTP component.
- Added country code before P1 and P2 mobile fields.
- Added E.164 phone normalization with country code support (preventing local `055...` and international `+966...` mismatches).
- Added country code support for Partner 2 invitation mobile/WhatsApp.
- Added Relationship Start Date to P1.
- Added 18+ validation.
- Enforced same-as-verified-mobile WhatsApp trust rule.
- Added secure random invitation IDs and 3-day invitation expiration checks.
- Added authenticated P1 invitation creation/cancellation and P2 acceptance with atomic transaction contact reservations.
- Certificate reference is generated only after acceptance.
- Added real QR rendering.
- Public verification and contact search now use bounded exact index lookups, enforcing strict dual-partner consent (default OFF) and returning only active relationship indicators and stages for contact searches.
- Step 5 exact contact search replaces collection scans with maximum 2 bounded reads (exact index read + authoritative relationship read) returning strictly `{ found: boolean, stage: "Dating" | "Engaged" | "Married" | null }`, with HTTP 429 and 503 error status handling and zero PII.
- Atomic public contact index (`public_contact_index`) maintenance enforced across acceptance, consent changes, contact changes, stage changes, termination, and account deletion inside Firestore transactions with strict ownership protection.
- End Relationship permanently deletes relationship-scoped information (relationship document, certificate projection, change requests, invitations, notifications, owned reservations, and owned public indexes) inside a single Firestore transaction without retaining history or persistent notifications, while preserving both users' accounts and individual profile data.
- Public invitation preview before sign-in enforces an explicit minimal allowlist exposing only P1's full name, requested relationship stage, status, and expiration (zero P2 name, zero emails, zero phones, zero start date, zero recordId, zero UIDs), with full proposal data gated strictly behind server-side verified recipient authorization. Expired, cancelled, declined, or accepted invitations expose no personal preview.
- `/api/health` performs a live, bounded read-only Firestore probe: returns HTTP 200 and status: "ok" only on verified reachability; returns HTTP 503 and status: "unavailable" on unconfigured, disconnected, credential-failure, or timeout states with strict response PII/error stripping and unhandled rejection prevention.
- Fixed dependency compatibility: aligned `esbuild` to `^0.28.0` for `vite@8.3.0`, committed reproducible `package-lock.json`, and verified with clean `npm ci`.
- Corrected backend runtime architecture documentation in `README.md` and `AI_STUDIO_SETUP.md` (clarifying Application Default Credentials vs Web config, and removing outdated in-memory store references).

## Persistence & Readiness

- Persistent storage is fully implemented using Firebase Admin Firestore (`adminDb`) and atomic transaction-backed contact uniqueness/reservation checks.
- Real Google sign-in and real SMS OTP require Firebase project and authorized-domain configuration.

## Deployment

NOT DEPLOYED — LOCAL AI STUDIO PREVIEW ONLY.
