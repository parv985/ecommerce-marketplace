# Architecture Decisions — Reliability & Concurrency (V3.8–V3.13)

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

## V3.13 — Coupon status: derived on read, never a stored truth

**Decision:** Coupon status is computed from the current date and the
remaining usage limit every time it is read. The stored `status` field
is only the seller's **manual switch** (ACTIVE by default, INACTIVE
after a deactivation).

```
ACTIVE   <=>  stored status is ACTIVE
              AND startAt <= now <= endAt
              AND (usageLimit is null OR usageCount < usageLimit)
INACTIVE <=>  anything else (expired, fully used, not started, disabled)
```

Reasons:

- **A scheduled job would only add lag and failure modes.** There is no
  cron/queue in the deployment model (V3.9), and a coupon that expires
  at 9:00 must be rejected at 9:00, not at the next job run.
- **Persistence would break slot release.** Writing INACTIVE when a
  coupon hits its usage limit would permanently disable it, because the
  manual switch would then be off — yet cancelling an order releases
  the slot and the coupon must become redeemable again. Deriving the
  status makes the release automatic.
- **One rule, three surfaces.** `resolveCouponStatus` (service),
  `buildCouponStatusFilter` (list query, exact complement of the same
  rule) and `getCouponState` (seller-panel UI) all implement the same
  predicate, so the checkout decision, the `?status=` filter and the
  badge can never disagree.
- **Buyer messaging follows the state.** Expired and fully-used coupons
  return `400 COUPON_EXPIRED` / `400 COUPON_USAGE_LIMIT_REACHED` with
  the message "Coupon code expired"; deactivated or not-yet-started
  coupons keep `COUPON_INACTIVE`. The generic "invalid coupon" message
  is only ever shown for unknown codes and other validation failures.
