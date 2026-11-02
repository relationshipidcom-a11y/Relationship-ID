# Relationship ID — Fix Status

## Fixed in this package

- Removed fake email/register backend authentication.
- Replaced hard-coded Google login with Firebase Google Auth.
- Added Firebase password reset and persistent session selection.
- Added sign out.
- Added real WhatsApp phone verification/OTP component via Twilio.
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

## v11 Changes

- **Constant-Time SHA-256 Secret Verification**: Implemented `verifySecret` in `server.ts` utilizing fixed-length SHA-256 cryptographic digests evaluated with `crypto.timingSafeEqual`. Eliminated raw-buffer length comparisons and self-comparison dummies.
- **Strict Scheduler Header Handling**: Implemented `extractValidatedHeader` to inspect `rawHeaders` and parsed headers, rejecting duplicate headers (including case variations), ambiguous alias pairs, array-valued headers, and malformed inputs.
- **Header-Only Scheduler Authentication**: Updated `POST /api/reminders/process` to require `x-reminder-scheduler-secret` or alias `x-scheduler-secret`. Removed `req.query.secret` completely as an authentication source while permitting standard query parameters.
- **Narrowed App Check Exemption**: Restructured `requireAppCheck` to exempt strictly exact `POST /api/reminders/process` and `GET /api/health` endpoints without prefix matching (`startsWith`). Similar-prefix paths and unsupported HTTP methods strictly enforce App Check.
- **Targeted Dependency Security Fixes**:
  - `body-parser` updated from 1.20.8 to 1.20.9 via parent `express@4.22.3` (resolving GHSA-27r3-jxmh-p828).
  - `@google-cloud/storage` updated from 8.2.0 to 8.4.0 within `firebase-admin@14.5.0` (`^8.1.0`), eliminating transitive `uuid@9.0.1` and `gaxios@6.7.1` (resolving GHSA-w5hq-g745-h8pq).
  - `undici` updated from 8.11.2 to 8.12.3 via `jsdom@30.1.2` (resolving GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472, GHSA-xjj6-f33q-929c).
- **Unresolved Dependency Advisory**:
  - `@grpc/grpc-js@1.9.16` (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4) required transitively by `@firebase/firestore@4.17.2` inside `firebase@12.19.0`. Its declared range `'~1.9.0'` restricts updates to `<1.10.0`. Official patched versions are $\ge 1.13.6$.
  - Inspection of npm registry confirms `firebase@12.19.0` is the highest release of Firebase 12.x, and even `firebase@13.1.0` (with `@firebase/firestore@4.19.0`) still declares `'@grpc/grpc-js': '~1.9.0'`. Upstream Firebase has not bumped this constraint.
  - The `npm audit` suggestion to downgrade to `firebase@9.14.0` is a breaking major downgrade from 2022 and strictly forbidden.
  - Runtime verification confirms: `server.ts` uses `firebase-admin@14.5.0` which resolves to patched `@grpc/grpc-js@1.14.5`, while the browser client bundle built by Vite uses browser WebChannel and contains zero gRPC code. `@grpc/grpc-js@1.9.16` is not reachable through the inspected client bundle or inspected server entry points; the package remains installed in `node_modules` and reported by audit tooling.
- **Documentation Alignment**: Updated `README.md` and `AI_STUDIO_SETUP.md` with accurate Twilio WhatsApp endpoint documentation (`/api/whatsapp/verify/start`, `/api/whatsapp/verify/check`), removed obsolete Firebase Phone Auth instructions, documented stable `CONTACT_HASH_SECRET` requirements, and clarified production warning vs. blocking startup behavior for `FIREBASE_PROJECT_ID`.
- **Frontend Chunk Warning**: The ~539KB build chunk warning is an informational build output and outside the scope of this security and configuration correction.
- **Reminder-Delivery Reliability Repairs**:
  - **Bounded Crash Recovery & Claim Leasing**: Implemented `claimReminderDelivery` with a 5-minute lease (`REMINDER_CLAIM_LEASE_MS`). If a worker crashes or terminates during processing (`status: 'claiming'`), email recovery is allowed only with a known unchanged payload inside the safe retry window; abandoned push claims are withheld from automatic replay because acceptance is unknown.
  - **Fencing Token Against Stale Worker Overwrite**: Assigned a unique `claimId` per claim attempt and verified atomically in `recordReminderDeliveryOutcome`. If a delayed worker wakes up after a lease has been reclaimed, its write is rejected (`superseded: true`) and cannot overwrite newer state.
  - **Bounded Retries & Backoff**: Added `attempts` tracking with `REMINDER_MAX_ATTEMPTS = 3` and `REMINDER_RETRY_BACKOFF_MS = 15 minutes`. Retries are suppressed during backoff and stop after 3 attempts, eliminating infinite hourly retry loops.
  - **Channel Independence**: Email (`${userId}_email_${date}`) and Push (`${userId}_push_${date}`) maintain independent claims, retry state, and delivery outcomes.
  - **Pre-Dispatch Eligibility & Deletion Checks**: Partner occasions (partner birthday and anniversary) are suppressed if relationship deletion is pending (`isRelationshipDeletionPending`), other partner account deletion is pending (`isUserDeletionPending`), or an active pair block exists (`INVITATION_BLOCKS_COL`), while user birthday remains active.
  - **Truthful Delivery Audit & Timeout Handling**: Mark delivery successful only upon provider confirmation. Added 10-second timeout controllers to Resend fetch and WebPush gateway calls; distinguished timeouts (`TIMEOUT_UNCERTAIN`) from confirmed rejections. Resend passes idempotency key (`${deliveryDocId}`); WebPush subscriptions are deleted only on permanent expiration (HTTP 404/410 or invalid subscription).
- **Explicit Scope Limitation**: This is not an exhaustive security or production certification; current verified routes and residual limits are described below.

## Persistence & Readiness

- Persistent storage is fully implemented using Firebase Admin Firestore (`adminDb`) and atomic transaction-backed contact uniqueness/reservation checks.
- Real Google sign-in and WhatsApp verification require Firebase project and Twilio configuration.

## Deployment

NOT DEPLOYED — LOCAL AI STUDIO PREVIEW ONLY.


## Direct editor & blocking corrections — 25 October 2026

- **Block Enforcement for Existing Invitation and Reminder Routes**:
  - **Bidirectional Enforcement**: Bidirectional pair block matching enforced across invitation creation, invitation acceptance, and reminder dispatches.
  - **Dual-Party Contact Hash Collection**: Updated invitation decline block creation (`POST /api/invitations/:inviteId/decline`) to collect and store canonical contact hashes for BOTH inviter (P1) and recipient (P2) within the block document `contactHashes` array, supporting future bidirectional matching for contacts recorded in that block. Legacy/current-contact handling and historical limitations are described below.
  - **Authorized Unblock Protection**: `DELETE /api/blocks/:p1Uid` strictly verifies that `p2Uid` on the block document matches `res.locals.firebaseUser.uid`, preventing unauthorized unblocking.
  - **Fail-Closed Block Lookup**: Any error or outage reading block status during reminder processing or in-app active reminders suppresses partner-dependent occasions (partner birthday and anniversary) while preserving independent own-birthday eligibility.
  - **Zero Privacy Leakage**: Block rejections return standard allowlisted errors (`INVITATION_NOT_ALLOWED` / 403 / 404) without exposing who blocked whom or disclosing private account/contact details.

- **Stable Reminder Idempotency & Recovery**:
  - **Stable Provider Idempotency Key**: Email provider idempotency key uses stable `${deliveryDocId}` (`${userId}_email_${localDate}`) across all retry attempts and crash recoveries without `attemptCount` or `claimId` suffixes, ensuring provider-level request deduplication within the provider retention window.
  - **Payload Consistency**: The dispatcher now checks a persisted SHA-256 fingerprint of sender, recipient, subject, and text. Changed or unknown payloads are withheld from automatic replay under the same key.
  - **Worker Claim Fencing**: Unique `claimId` per claim attempt verified atomically in `recordReminderDeliveryOutcome` (`superseded: true` on mismatch), preventing stale workers from overwriting newer claim state.
  - **Push Subscription Preservation**: Push subscriptions deleted strictly on permanent expiration (HTTP 404/410); transient errors and timeouts preserve subscriptions for retries.

- **Verification Summary**:
  - `npx tsc --noEmit`: PASSED (0 errors)
  - `npm run lint`: PASSED (0 errors)
  - `npm run build`: PASSED
  - `npm run test:unit`: PASSED — 570 tests passed (historical run; current verification below) with 0 failures, 0 skips, and 0 errors.



## Verified direct repair — 25 October 2026 (Audit Defect Corrections)

- **Symmetric Opposite Participant Contact Matching**:
  - `POST /api/invitations` updated inside its Firestore transaction to determine the opposite participant UID relative to `user.uid` for every active block (`bData.p1Uid === user.uid ? bData.p2Uid : bData.p1Uid`).
  - Resolves the opposite participant's current canonical contacts (`email`, `phoneE164`, `whatsappE164`), hashes them, and rejects with 403 `INVITATION_NOT_ALLOWED` if any match `targetHashes`.
  - Blocked P1 cannot create an invitation to P2 even after P2 updates their email or phone number.
  - Keeps all block and user profile reads inside the transaction before writes; preserves pair-UID checks during acceptance and blocker-only unblocking (`DELETE /api/blocks/:p1Uid`).

- **Per-Channel Eligibility Refresh in Reminder Dispatcher**:
  - The reminder processor (`POST /api/reminders/process`) now calls `resolveActiveOccasions(userId, timeZone, referenceDate)` independently before email and before push notification dispatch.
  - If an active pair block is inserted into Firestore while email is processing, the subsequent push re-check detects `blocked === true`, sets `hasActiveRecord = false`, and filters out partner-dependent occasions (`partner_birthday`, `anniversary`) for the push notification.

- **Retryable Configuration Error Handling**:
  - `sendReminderEmail` when `RESEND_API_KEY` is missing now returns `{ success: false, error: 'SERVICE_UNCONFIGURED', permanent: false }`.
  - `SERVICE_UNCONFIGURED` is no longer marked as a permanent rejection (`permanent: true`), allowing reminders to be automatically claimed and retried on subsequent scheduler runs once `RESEND_API_KEY` is restored.

- **Verification Summary**:
  - `npx tsc --noEmit`: PASSED (0 errors)
  - `npm run lint`: PASSED (0 errors)
  - `npm run build`: PASSED
  - `npx tsx --test tests/reminder-delivery-reliability.test.ts`: PASSED (22/22 subtests passed)
  - `npx tsx --test tests/invitation-blocks.test.ts`: PASSED (14/14 subtests passed)
  - Full Test Suite: **577 tests PASSED** across all test suites (0 failed, 0 skipped, 0 errors).



## Live clock and per-channel eligibility repair — 25 October 2026

- Removed referenceDate timestamps from scheduler claim, ownership and outcome calls. These helpers now use their actual operational clock; calendar overrides remain test-only and affect occasion calculation only. Backoff starts when failure is recorded, not when the user iteration began.
- Added a shared per-channel eligibility read before email and push: current settings/consent, requesting account deletion status, current Auth disabled/verification state, current timezone/local delivery window and current relationship/block occasions. The push decision no longer uses settings cached before email.
- Existing email idempotency/payload checks, bounded retries, uncertain push suppression, claim fencing and own-birthday eligibility are preserved. No change to invitation blocking or provider configuration in this repair.
- Added three regression tests covering consent removal/disable, account deletion/Auth disable during email, real failure timestamps/backoff despite a historical calendar date, and lease expiry during the ownership read preventing email dispatch. Existing retry tests now simulate elapsed operational time rather than changing the calendar reference.
- Verification: current saved server and reminder tests with ZIP (22) support files; npm run lint (TypeScript) PASS, npm run build PASS (existing chunk warning), focused reminder suite 25 tests PASS, full suite via direct Node/tsx TAP runner 580 PASS / 0 failed / 0 skipped. No tests removed. Dependencies and lockfiles unchanged.
- Limits: eligibility can still change between the final read and provider acceptance; external delivery cannot be atomic with Firestore. Live email/push, scheduler, real Firestore contention, production configuration and physical iPhone were not tested. Nothing deployed, no secrets changed, no production data edited and no real messages sent.


## Verified invitation authentication and account cleanup repair — 25 October 2026

- Both server-side Firebase ID-token verification paths now use `verifyIdToken(token, true)`. Revoked, deleted, disabled or invalid identities cannot authorize protected invitation proposals; the existing minimal public preview remains available. The previously repaired authenticated-route guard is preserved.
- `cleanUserRemindersInBatches` propagates settings-delete, query and batch failures and processes subscriptions, dismissals and deliveries in pages of 50. Post-Auth deletion failures return the existing HTTP 202 `DELETION_PENDING` response and retain durable progress instead of reporting complete deletion.
- Account reconciliation now cleans reminder settings/subscriptions/dismissals/deliveries and both WhatsApp verification singleton documents before deleting the profile/progress marker. Failed reconciliation retains progress and reports failure; successful retries are idempotent and preserve unrelated users.
- Added regression coverage for active/deleted/disabled/revoked/expired/invalid/unavailable sessions, optional invitation privacy, cleanup query/document/batch/WhatsApp failures, successful retry, normal cleanup, missing documents, and multiple 50-document batches. Corrected one existing reconciliation fixture to represent the newly queried reminder collections; no tests removed.
- Verification on the current source: `npx tsc --noEmit` PASS; `npm run lint` PASS; `npm run build` PASS (existing chunk warning); focused three-file suite 50 PASS / 0 failed / 0 skipped; full suite via `NODE_ENV=test node --import tsx --import ./tests/setup.ts --test tests/*.test.ts tests/*.test.tsx`: 595 PASS / 0 failed / 0 skipped. Direct Node execution avoids the previously reproduced tsx CLI IPC restriction in this verification environment.
- Original offline probes rerun: deleted-account profile mutation HTTP 401, protected proposal withheld, cleanup fault HTTP 202 with progress retained, successful reconciliation leaves none of the six supporting collections for that account. JWT cryptographic validation and database failures were modeled; the installed Firebase Admin SDK's revocation branch was exercised.
- Limits: live Firebase sessions, providers, scheduler, real Firestore contention and physical-device testing NOT VERIFIED. Code changes only; no manual production reconciliation or API mutation, real messages, credential changes, Git operations, export, deployment or publication. This is not comprehensive launch certification.


## Reminder loop isolation and window pre-check — 26 October 2026

- Losing email claim ownership skips email only; push is still evaluated (the old `continue` was removed).
- Each user is wrapped in its own try/catch. A failure logs "[reminders] User processing failed; skipping user" with no PII, and later users still run. Leftover claims expire via the existing 5-minute lease.
- Existing regression tests: "Lost email claim ownership skips email only and still dispatches push" and "A user database error is logged without PII and does not stop later users".
- New: users outside the 09:00 local window are skipped using already-loaded settings, before deletion/Auth reads. Fresh per-channel eligibility inside the window is unchanged.
- New regression tests added in Part A:
  - "User outside the 09:00 window is skipped without Auth/deletion reads"
  - "User inside 09:00 window dispatches normally"
  - "Consent removal between email and push still stops push"
  - "Invalid timezone falls through"
- Real verification numbers:
  - `npx tsc --noEmit`: PASS (exit code 0, 0 errors)
  - `npm run build`: PASS (built in 1.63s, dist/server.cjs 256.2kb, exit code 0)
  - Full test suite (`NODE_ENV=test node --import tsx --import ./tests/setup.ts --test tests/*.test.ts tests/*.test.tsx`): 605 tests, 1 suite, 605 pass, 0 fail, 0 cancelled, 0 skipped, duration 166002ms
  - `grep -rn "\.only(\|\.skip(" tests`: 0 matches

## Invitation creation privacy — 26 October 2026

- POST /api/invitations no longer rejects a proposed partner contact that already belongs to an active relationship. The response has the same status and shape as for a free contact, so invitation creation cannot be used to discover whether someone is in an active relationship (the contact search reveals this only with dual-partner consent).
- Acceptance is still blocked: a contact in an active relationship receives HTTP 409 (P2_ALREADY_IN_ACTIVE_RELATIONSHIP or CONTACT_IN_ACTIVE_RELATIONSHIP), including via the atomic contact reservation for accounts without activeRecordId.
- Regression test: tests/contact-reservations.test.ts test 12, "Invitation creation does not reveal active relationship status, while acceptance is rejected".

## Stage terminology, tagline, and plum palette update — 31 October 2026

1. Replaced the Arabic stage word «تعارف» with «مواعدة» in:
   - `src/components/ChangeRequestModal.tsx` (lines 387, 399, 411)
   - `src/components/VerifyPortalModal.tsx` (line 173)
   - `src/content/legal.ts` (line 158)
   Kept "(Dating)" English hints intact.
2. Updated `serviceIntroTitle` in `src/i18n/translations.ts`:
   - AR: 'سجّل مرحلة ارتباطك بتوثيق رقمي'
   - EN: 'Register your relationship stage with digital documentation'
3. Updated `--color-plum-*` and `--color-dusty-rose*` in `src/index.css` to a real plum + rose palette with text contrast ≥ 4.5:1 across all backgrounds and surfaces.
4. Deleted unreferenced asset `public/assets/aistudio/og-image_d18a766b.jpg`.

