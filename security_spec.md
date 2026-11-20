# Security Specification — CuentasClaras

## Data Invariants
1. **Identity Integrity**: Every document under `/users/{userId}` and its subcollections (`private`, `gatherings`, `notifications`) MUST belong to `request.auth.uid == userId` with `request.auth.token.email_verified == true`.
2. **PII Isolation**: User email, saved Alias/CBU, and notification preferences are stored in `/users/{userId}/private/profile` and never exposed to any other user.
3. **Bounded Payloads**: Gathering arrays are strictly bounded (`participants <= 30`, `expenses <= 100`, `settledTransferIds <= 50`) and strings are bounded (`title <= 140`, `body <= 500`, `id <= 128`).
4. **Immutable Ownership & Timestamps**: `ownerId`/`uid` and `createdAt` cannot be altered on update; `createdAt`/`updatedAt` must match `request.time`.

## Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read/write to `/users/{userId}/gatherings/{id}`.
2. Authenticated user with `email_verified: false` writing a gathering.
3. Authenticated user A writing to `/users/{userB}/gatherings/{id}` (cross-tenant write).
4. Authenticated user A setting `ownerId: userB` inside `/users/{userA}/gatherings/{id}` (identity spoofing).
5. Authenticated user A reading `/users/{userB}/private/profile` (PII leak).
6. Creating a gathering with an extra shadow field `isAdmin: true` (blocked by `keys().hasOnly()`).
7. Updating `ownerId` or `createdAt` on an existing gathering (immutable field violation).
8. Creating a gathering with forged client timestamp `createdAt` != `request.time`.
9. Creating a gathering with invalid document ID containing `/` or > 128 chars (ID poisoning).
10. Injecting > 100 expenses or > 30 participants into a gathering (resource exhaustion).
11. Injecting a 10KB title string into `title` (blocked by `size() <= 140`).
12. Creating a notification with invalid `type: "admin_alert"` (blocked by enum allowlist).
