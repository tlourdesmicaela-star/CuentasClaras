# Security Specification — CuentasClaras

## Data Invariants
1. **Identity Integrity**: Every document under `/users/{userId}` and its subcollections (`private`, `gatherings`, `notifications`) MUST belong strictly to `request.auth != null && request.auth.uid == userId`. Email/password accounts authenticate via immutable Firebase UID ownership rather than mutable email claims.
2. **PII Isolation**: User email, saved Alias/CBU, and notification preferences are stored exclusively in `/users/{userId}/private/profile` (`isOwner(userId)` only) and never exposed to any other user or unauthenticated caller.
3. **Username Reservation Without PII**: `/usernames/{usernameKey}` stores only `{ uid, username, createdAt }`, is owner-readable/creatable/deletable only, immutable on update, and `allow list: if false` prevents scraping.
4. **Bounded Payloads**: Gathering arrays are strictly bounded (`participants <= 30`, `expenses <= 100`, `settledTransferIds <= 50`) and strings are bounded (`username <= 30`, `title <= 140`, `body <= 500`, `id <= 128`).
5. **Immutable Ownership & Timestamps**: `ownerId`/`uid` and `createdAt` cannot be altered on update; `createdAt`/`updatedAt` must match `request.time`.

## Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read/write to `/users/{userId}/gatherings/{id}` or `/usernames/{usernameKey}`.
2. Authenticated user A listing `/usernames` or `/users` (blocked by `allow list: if false`).
3. Authenticated user A writing to `/users/{userB}/gatherings/{id}` (cross-tenant write).
4. Authenticated user A setting `ownerId: userB` inside `/users/{userA}/gatherings/{id}` or `/usernames/{usernameKey}` (identity spoofing).
5. Authenticated user A reading `/users/{userB}/private/profile` (PII leak).
6. Creating a gathering or user document with an extra shadow field `isAdmin: true` (blocked by `keys().hasOnly()`).
7. Updating `ownerId` or `createdAt` on an existing gathering, or updating `/usernames/{usernameKey}` (immutable).
8. Creating a gathering or username reservation with forged client timestamp `createdAt` != `request.time`.
9. Creating a gathering with invalid document ID containing `/` or > 128 chars, or invalid username `..` (ID poisoning).
10. Injecting > 100 expenses or > 30 participants into a gathering (resource exhaustion).
11. Injecting a 10KB title string into `title` (blocked by `size() <= 140`).
12. Creating a notification with invalid `type: "admin_alert"` (blocked by enum allowlist).
