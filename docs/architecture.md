# Architecture Decisions — Reliability & Concurrency (V3.8–V3.12)

This document records the engineering decisions behind the
"production features" phase. The guiding rule from the specification
was: *introduce infrastructure only where it provides real value*,
and *prefer atomic MongoDB operations when they are sufficient*.

## V3.8 — Redis: intentionally NOT introduced

**Decision:** No Redis dependency. There is no current use case that
justifies it.

Reasons:

- **Deployment model.** The backend runs as a single Node.js instance
  against MongoDB. There is no horizontal scaling, so there is no
  shared state that an external cache/lock store would need to
  coordinate across instances.
- **Caching.** No query is hot enough to require a distributed cache.
  Catalog reads hit indexed MongoDB queries; product/price data is
  source-of-truth in the database and must not be served stale anyway
  (prices, stock and discount state change constantly).
- **Rate limiting.** Already handled in-process by `express-rate-limit`
  (strict limiters on auth endpoints, a baseline API limiter). A
  Redis-backed limiter would only matter with multiple instances.
- **Sensitive data.** Caching user/token/payment data in an extra store
  would widen the attack surface for no benefit.

If the application is ever deployed multi-instance, the first Redis
candidates would be: the auth rate limiter, catalog page caching
(short TTL + invalidation on product/stock change), and distributed
locks for settlement generation.

## V3.9 — Background jobs / queues: intentionally NOT introduced

**Decision:** No queue system. Long-running or external work is already
kept out of request paths:

- **Email/notifications** are fire-and-forget: `notifyUser` catches
  delivery failures and never blocks the business flow that triggered
  them (see `src/modules/notifications/notification.service.ts`).
- **Settlement generation** is an admin-triggered batch operation run
  directly (aggregation over a single month's orders). It is bounded
  by the month window and completes in milliseconds-to-seconds; a
  queue would add operational complexity without a real bottleneck.

A queue becomes justified when work is (a) unbounded in size, (b)
scheduled (e.g. daily settlement reminders), or (c) slow enough to
time out HTTP requests. The natural fit then is BullMQ + Redis, with
the email/notification worker as the first job.

## V3.10 — Retries

**Where retries are safe, they exist:**

- **Emails** (`src/services/email.service.ts`): `sendNotificationEmail`
  retries twice with exponential backoff (500ms, 1s). Duplicate emails
  are harmless, so retrying is safe.
- **Payment webhooks**: Razorpay retries failed deliveries. The
  webhook handler is idempotent (unique event claim), so a redelivery
  is a safe no-op rather than a double-processing risk.

**Where retries are NOT performed (documented, not coded):**

- Payment initiation / capture / refund creation — a retry could
  create a second charge or refund. The API surface is idempotent
  instead: `initiate` returns the existing payment, `verify` replays
  the signature check, and `refund` returns the existing refund.
- Settlement payout marking — a duplicate mark-paid must be an
  explicit no-op, never an automatic retry loop.

## V3.11 — Distributed locking: not needed; atomic MongoDB operations

Every place where concurrent requests could corrupt state uses an
atomic MongoDB primitive instead of a distributed lock:

| Concern | Mechanism |
| --- | --- |
| Overselling at checkout | `$inc` stock with `$gte` guard + rollback of applied decrements |
| Double-submit checkout | Cart checkout claim (`checkoutLockedAt`, atomically set, 5-minute stale expiry) — `CART_CHECKOUT_IN_PROGRESS` |
| Coupon total usage limit | Atomic `findOneAndUpdate` `$inc usageCount` guarded by `$lt usageLimit`; 101st concurrent claim fails |
| Coupon per-user limit | Unique `(couponId, userId)` partial index + atomic slot reservation |
| Duplicate webhook processing | Sparse unique index on `Payment.webhookEventId` — the event claim is the lock |
| Duplicate return requests | Partial unique index on active `ReturnRequest.orderId` |
| Double settlement generation | Unique `(sellerId, periodKey)` index on `Settlement` |
| Double recovery-code use | `updateOne` + `$pull` with a modifiedCount check |

A distributed lock (Redis `SET NX`) would only be warranted if these
operations moved across multiple processes — in which case the unique
indexes above would still be the backstop.

## V3.12 — Idempotency map

| Operation | Idempotent? | How |
| --- | --- | --- |
| `POST /payments/orders/:id/initiate` | Yes | Returns the existing payment record instead of a second gateway order |
| `POST /payments/orders/:id/verify` | Yes | Already-PAID returns current state |
| `POST /payments/webhook/razorpay` | Yes | Unique webhook event claim; duplicate deliveries are no-ops |
| `POST /payments/orders/:id/refund` | Yes | Already-REFUNDED returns current state (same gateway refund id) |
| Order cancellation | Yes | Already-CANCELLED is a no-op; stock restored exactly once |
| Coupon usage | Yes | Atomic slot reserve + unique usage records; cancelled orders release usage |
| Settlement generation | Yes | Unique `(sellerId, periodKey)`; regenerating returns existing |
| Order creation (checkout) | Yes (now) | Cart claim prevents duplicate orders from concurrent submits |
