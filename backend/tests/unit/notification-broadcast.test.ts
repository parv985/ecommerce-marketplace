import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Seller broadcast targeting + the in-app/email delivery guarantees.
 *
 * The persistence layer and the mail transport are mocked, so this runs
 * without MongoDB — tests/seller-notifications.test.ts and
 * tests/notification-delivery.test.ts cover the same contract against a
 * real database. What is pinned here is the part that is easy to get wrong
 * and expensive to get wrong in production:
 *
 *   - the multi-select contract (buyerIds, XOR the other targets, size
 *     limits, id validation),
 *   - only active BUYER accounts are reachable, and ids that are not are
 *     reported instead of silently dropping,
 *   - the in-app record is written before any email attempt,
 *   - a retried broadcast (same requestId) never creates a second
 *     notification or a second email, while a previously FAILED email is
 *     replayed — so an email failure can be healed without duplicating the
 *     in-app notification,
 *   - an address that cannot receive mail is recorded as INVALID_ADDRESS
 *     rather than pretending a send happened,
 *   - the admin retry pass claims records atomically and cannot resend the
 *     same email twice.
 */

vi.hoisted(() => {
  process.env.MONGODB_URI =
    "mongodb://localhost:27017/ecommerce_marketplace_unit";
  process.env.JWT_ACCESS_SECRET =
    "unit-test-access-secret-unit-test-access-secret";
  process.env.JWT_REFRESH_SECRET =
    "unit-test-refresh-secret-unit-test-refresh-secret";
  process.env.CLOUDINARY_CLOUD_NAME = "unit-test";
  process.env.CLOUDINARY_API_KEY = "unit-test";
  process.env.CLOUDINARY_API_SECRET = "unit-test";
});

/**
 * Tiny stand-in for the user collection: enough filtering (role, isActive,
 * $in) that the tests exercise the service's real query intent rather than
 * a canned answer.
 */
const db = vi.hoisted(() => ({
  users: [] as Array<{
    _id: { toString(): string };
    email: string;
    role: string;
    isActive: boolean;
  }>,
}));

vi.mock("../../src/models/User.js", () => ({
  User: {
    findById: (id: string) => ({
      select: () => ({
        exec: async () => {
          const user = db.users.find(
            candidate => candidate._id.toString() === id,
          );

          return user ? { email: user.email, role: user.role } : null;
        },
      }),
    }),
    find: (filter: Record<string, unknown>) => ({
      select: () => ({
        exec: async () => {
          const role = filter.role as string | undefined;
          const isActive = filter.isActive as boolean | undefined;
          const inIds = (filter._id as { $in?: string[] } | undefined)?.$in;

          return db.users.filter(user => {
            if (role && user.role !== role) return false;
            if (isActive !== undefined && user.isActive !== isActive) {
              return false;
            }
            if (
              Array.isArray(inIds) &&
              !inIds.includes(user._id.toString())
            ) {
              return false;
            }

            return true;
          });
        },
      }),
    }),
  },
}));

const notificationRepo = vi.hoisted(() => {
  const store = new Map<
    string,
    {
      _id: { toString(): string };
      recipientId: string;
      emailStatus: string;
      emailAttempts: number;
      title: string;
      message: string;
    }
  >();

  return {
    store,
    /** Every notification the delivery layer tried to persist, in order. */
    created: [] as Array<Record<string, unknown>>,
    createNotificationIfNew: vi.fn(),
    createDefaultPreference: vi.fn(),
    findNotificationByDedupeKey: vi.fn(),
    findPreferenceByUserId: vi.fn(),
    markEmailStatus: vi.fn(),
    claimEmailRetry: vi.fn(),
    listFailedEmailNotifications: vi.fn(),
    countFailedEmails: vi.fn(),
    releaseEmailRetryClaim: vi.fn(),
    /* Not used by these paths, but the service imports the module whole. */
    countUnreadForUser: vi.fn(),
    findNotificationByIdAndUser: vi.fn(),
    listNotificationsForUser: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    markNotificationRead: vi.fn(),
    updatePreferenceByUserId: vi.fn(),
    createNotification: vi.fn(),
  };
});

vi.mock(
  "../../src/modules/notifications/notification.repository.js",
  () => notificationRepo,
);

const sendNotificationEmailMock = vi.hoisted(() => vi.fn());

/*
 * The real address validator stays in place (it is part of what is being
 * tested); only the transport is replaced.
 */
vi.mock("../../src/services/email.service.js", async () => {
  const actual = await import("../../src/services/email.service.js");

  return {
    ...actual,
    sendNotificationEmail: sendNotificationEmailMock,
  };
});

vi.mock("../../src/services/audit.service.js", () => ({
  logAudit: vi.fn(async () => {}),
}));

import { logAudit } from "../../src/services/audit.service.js";
import { NotificationEmailStatus } from "../../src/models/Notification.js";
import {
  NotificationChannel,
  NotificationType,
} from "../../src/constants/notificationTypes.js";
import {
  notifyUser,
  retryFailedNotificationEmails,
  sendSellerNotification,
} from "../../src/modules/notifications/notification.service.js";
import {
  isValidEmailAddress,
} from "../../src/services/email.service.js";
import {
  sellerNotificationSchema,
} from "../../src/modules/notifications/notification.schema.js";
import { AppError } from "../../src/errors/AppError.js";

const BUYER_1 = "64a0000000000000000000b1";
const BUYER_2 = "64a0000000000000000000b2";
const BUYER_3 = "64a0000000000000000000b3";
const SELLER_ID = "64a0000000000000000000s1";

const objectId = (id: string) => ({ toString: () => id });

const seedUsers = () => {
  db.users = [
    {
      _id: objectId(BUYER_1),
      email: "priya@gmail.com",
      role: "BUYER",
      isActive: true,
    },
    {
      _id: objectId(BUYER_2),
      email: "rahul@yopmail.com",
      role: "BUYER",
      isActive: true,
    },
    {
      _id: objectId(BUYER_3),
      email: "broken-profile",
      role: "BUYER",
      isActive: true,
    },
    {
      _id: objectId(SELLER_ID),
      email: "shop@example.com",
      role: "SELLER",
      isActive: true,
    },
  ];
};

/** Fire-and-forget email dispatch settles on a later microtask. */
const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  notificationRepo.store.clear();
  notificationRepo.created.length = 0;
  seedUsers();

  sendNotificationEmailMock.mockResolvedValue(undefined);
  notificationRepo.findPreferenceByUserId.mockResolvedValue({
    emailOrderUpdates: true,
    emailPaymentUpdates: true,
    emailPromotional: true,
    inApp: true,
  });
  notificationRepo.createDefaultPreference.mockResolvedValue({
    emailOrderUpdates: true,
    emailPaymentUpdates: true,
    emailPromotional: true,
    inApp: true,
  });
  notificationRepo.findNotificationByDedupeKey.mockImplementation(
    async (dedupeKey: string) =>
      notificationRepo.store.get(dedupeKey) ?? null,
  );
  notificationRepo.createNotificationIfNew.mockImplementation(
    async (data: Record<string, unknown>) => {
      const id = `notif-${notificationRepo.store.size + 1}`;
      const record = {
        _id: objectId(id),
        recipientId: data.recipientId as string,
        emailStatus: data.emailStatus as string,
        emailAttempts: 0,
        title: data.title as string,
        message: data.message as string,
      };

      if (data.dedupeKey) {
        notificationRepo.store.set(data.dedupeKey as string, record);
      }

      notificationRepo.created.push(
        record as unknown as Record<string, unknown>,
      );

      return record;
    },
  );
  notificationRepo.markEmailStatus.mockImplementation(
    async (id: string, status: NotificationEmailStatus) => {
      for (const record of notificationRepo.store.values()) {
        if (record._id.toString() === id) {
          record.emailStatus = status;
          record.emailAttempts += 1;
        }
      }
    },
  );
  notificationRepo.claimEmailRetry.mockImplementation(async () => null);
  notificationRepo.listFailedEmailNotifications.mockResolvedValue([]);
  notificationRepo.countFailedEmails.mockResolvedValue(0);
});

describe("seller notification request schema", () => {
  const valid = {
    title: "Back in stock",
    message: "The item you asked about is available again.",
  };

  it("accepts a selection of buyer ids", () => {
    const parsed = sellerNotificationSchema.parse({
      ...valid,
      buyerIds: [BUYER_1, BUYER_2],
    });

    expect(parsed.buyerIds).toHaveLength(2);
    /* Default is BOTH, i.e. in-app plus the registered inbox. */
    expect(parsed.channel).toBe(NotificationChannel.BOTH);
  });

  it("accepts a single selected buyer and an idempotency token", () => {
    const parsed = sellerNotificationSchema.parse({
      ...valid,
      buyerIds: [BUYER_1],
      requestId: "9f0f9c1e-1f1e-4a5b-8c9d-0e1f2a3b4c5d",
    });

    expect(parsed.buyerIds).toEqual([BUYER_1]);
    expect(parsed.requestId).toBe(
      "9f0f9c1e-1f1e-4a5b-8c9d-0e1f2a3b4c5d",
    );
  });

  it("keeps the legacy single-buyer and all-buyers targets", () => {
    expect(
      sellerNotificationSchema.parse({ ...valid, buyerId: BUYER_1 }).buyerId,
    ).toBe(BUYER_1);
    expect(
      sellerNotificationSchema.parse({
        ...valid,
        audience: "ALL_BUYERS",
      }).audience,
    ).toBe("ALL_BUYERS");
  });

  it("requires exactly one target", () => {
    expect(() => sellerNotificationSchema.parse(valid)).toThrow();

    expect(() =>
      sellerNotificationSchema.parse({
        ...valid,
        buyerIds: [BUYER_1],
        audience: "ALL_BUYERS",
      }),
    ).toThrow();

    expect(() =>
      sellerNotificationSchema.parse({
        ...valid,
        buyerIds: [BUYER_1],
        buyerId: BUYER_2,
      }),
    ).toThrow();
  });

  it("rejects an empty selection, malformed ids, and oversized broadcasts", () => {
    expect(() =>
      sellerNotificationSchema.parse({ ...valid, buyerIds: [] }),
    ).toThrow();

    expect(() =>
      sellerNotificationSchema.parse({
        ...valid,
        buyerIds: ["not-an-object-id"],
      }),
    ).toThrow();

    expect(() =>
      sellerNotificationSchema.parse({
        ...valid,
        buyerIds: Array.from(
          { length: 501 },
          (_, index) =>
            `64a00000000000000000${index.toString(16).padStart(4, "0")}`,
        ),
      }),
    ).toThrow();
  });

  it("validates the message content itself", () => {
    expect(() =>
      sellerNotificationSchema.parse({
        ...valid,
        title: "hi",
        buyerIds: [BUYER_1],
      }),
    ).toThrow();

    expect(() =>
      sellerNotificationSchema.parse({
        ...valid,
        message: "tiny",
        buyerIds: [BUYER_1],
      }),
    ).toThrow();

    expect(() =>
      sellerNotificationSchema.parse({
        ...valid,
        title: "x".repeat(201),
        buyerIds: [BUYER_1],
      }),
    ).toThrow();
  });
});

describe("email address validation", () => {
  it("accepts any deliverable mailbox, real or test-only", () => {
    expect(isValidEmailAddress("buyer.person@gmail.com")).toBe(true);
    expect(isValidEmailAddress("  buyer123@yopmail.com  ")).toBe(true);
    expect(isValidEmailAddress("ops@corp.example.co.uk")).toBe(true);
  });

  it("rejects addresses that cannot receive mail", () => {
    expect(isValidEmailAddress("")).toBe(false);
    expect(isValidEmailAddress("   ")).toBe(false);
    expect(isValidEmailAddress("broken-profile")).toBe(false);
    expect(isValidEmailAddress("no-domain@")).toBe(false);
    expect(isValidEmailAddress("@no-local.com")).toBe(false);
    expect(isValidEmailAddress("two@@example.com")).toBe(false);
    expect(isValidEmailAddress("a b@example.com")).toBe(false);
    /* Header/recipient injection attempts must never reach the transport. */
    expect(
      isValidEmailAddress("buyer@example.com\r\nBcc: victim@example.com"),
    ).toBe(false);
    expect(
      isValidEmailAddress("buyer@example.com, other@example.com"),
    ).toBe(false);
    expect(isValidEmailAddress(null)).toBe(false);
    expect(isValidEmailAddress(undefined)).toBe(false);
    expect(isValidEmailAddress(42)).toBe(false);
  });
});

describe("notifyUser delivery rules", () => {
  it("persists the in-app copy first and mirrors it to the buyer's inbox", async () => {
    const outcome = await notifyUser({
      recipientId: BUYER_1,
      type: NotificationType.SELLER_MESSAGE,
      title: "Order update",
      message: "Your parcel left our warehouse today.",
      channel: NotificationChannel.IN_APP,
      emailCategory: "order",
    });

    expect(outcome.status).toBe("CREATED");
    expect(outcome.email).toBe("QUEUED");

    /* Written before the email: the record exists with PENDING. */
    const created = notificationRepo.created[0]!;
    expect(created.recipientId).toBe(BUYER_1);
    expect(created.emailStatus).toBe(NotificationEmailStatus.PENDING);

    await flush();

    /* The registered address, never a caller-supplied one. */
    expect(sendNotificationEmailMock).toHaveBeenCalledWith(
      "priya@gmail.com",
      "Order update",
      expect.stringContaining("Your parcel left our warehouse today."),
    );
  });

  it("records INVALID_ADDRESS and sends nothing for an unusable profile", async () => {
    const outcome = await notifyUser({
      recipientId: BUYER_3,
      type: NotificationType.SELLER_MESSAGE,
      title: "Order update",
      message: "Your parcel left our warehouse today.",
      channel: NotificationChannel.BOTH,
    });

    expect(outcome.email).toBe("INVALID_ADDRESS");
    /* The buyer still gets the in-app notification. */
    expect(outcome.status).toBe("CREATED");
    expect(notificationRepo.created[0]!.emailStatus).toBe(
      NotificationEmailStatus.INVALID_ADDRESS,
    );
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("suppresses everything when the recipient turned in-app off and only order email is due", async () => {
    notificationRepo.findPreferenceByUserId.mockResolvedValue({
      emailOrderUpdates: false,
      emailPaymentUpdates: false,
      emailPromotional: false,
      inApp: false,
    });

    const outcome = await notifyUser({
      recipientId: BUYER_1,
      type: NotificationType.ORDER_SHIPPED,
      title: "Order shipped",
      message: "Your order has shipped.",
      channel: NotificationChannel.IN_APP,
      emailCategory: "order",
    });

    expect(outcome.status).toBe("SUPPRESSED");
    expect(notificationRepo.created).toHaveLength(0);
    await flush();
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("replays a failed email on a re-fired event without creating a second notification", async () => {
    const dedupeKey = `order:abc:status:SHIPPED`;

    const first = await notifyUser({
      recipientId: BUYER_1,
      type: NotificationType.ORDER_SHIPPED,
      title: "Order shipped",
      message: "Your order has shipped.",
      dedupeKey,
    });

    expect(first.status).toBe("CREATED");
    await flush();
    expect(notificationRepo.created).toHaveLength(1);

    /* The email copy failed for that record. */
    const record = notificationRepo.store.get(dedupeKey)!;
    record.emailStatus = NotificationEmailStatus.FAILED;

    notificationRepo.claimEmailRetry.mockResolvedValueOnce({
      _id: objectId("notif-1"),
    });

    const second = await notifyUser({
      recipientId: BUYER_1,
      type: NotificationType.ORDER_SHIPPED,
      title: "Order shipped",
      message: "Your order has shipped.",
      dedupeKey,
    });

    expect(second.status).toBe("DUPLICATE");
    expect(second.email).toBe("RETRY_QUEUED");
    /* No second notification — only the email is retried. */
    expect(notificationRepo.created).toHaveLength(1);

    await flush();

    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(2);
  });

  it("does nothing at all when the previous email had already been delivered", async () => {
    const dedupeKey = `order:def:status:SHIPPED`;

    await notifyUser({
      recipientId: BUYER_1,
      type: NotificationType.ORDER_SHIPPED,
      title: "Order shipped",
      message: "Your order has shipped.",
      dedupeKey,
    });
    await flush();

    const again = await notifyUser({
      recipientId: BUYER_1,
      type: NotificationType.ORDER_SHIPPED,
      title: "Order shipped",
      message: "Your order has shipped.",
      dedupeKey,
    });

    expect(again.status).toBe("DUPLICATE");
    expect(again.email).toBe("NOT_APPLICABLE");
    expect(notificationRepo.created).toHaveLength(1);
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1);
  });

  it("reports a missing recipient instead of throwing at the caller", async () => {
    const outcome = await notifyUser({
      recipientId: "64a0000000000000000000zz",
      type: NotificationType.ORDER_SHIPPED,
      title: "Order shipped",
      message: "Your order has shipped.",
    });

    expect(outcome.status).toBe("RECIPIENT_NOT_FOUND");
    expect(notificationRepo.created).toHaveLength(0);
  });
});

describe("sendSellerNotification targeting", () => {
  const message = {
    title: "Festive sale",
    message: "Everything in our store is 20% off this week.",
    channel: NotificationChannel.BOTH,
  };

  it("delivers to exactly the selected buyers, in-app and by email", async () => {
    const result = await sendSellerNotification(
      { id: SELLER_ID, role: "SELLER" },
      {
        ...message,
        buyerIds: [BUYER_1, BUYER_2],
      },
    );

    expect(result.deliveredTo).toBe(2);
    expect(result.requested).toBe(2);
    expect(result.notFoundBuyerIds).toEqual([]);
    expect(result.emailsQueued).toBe(2);

    await flush();

    const recipients = sendNotificationEmailMock.mock.calls.map(
      ([email]) => email,
    );
    expect(recipients.sort()).toEqual(
      ["priya@gmail.com", "rahul@yopmail.com"].sort(),
    );
  });

  it("ignores ids that are not active buyers and reports them", async () => {
    /* A seller account and an unknown id must never receive a buyer message. */
    const result = await sendSellerNotification(
      { id: SELLER_ID, role: "SELLER" },
      {
        ...message,
        buyerIds: [BUYER_1, SELLER_ID, "64a0000000000000000000zz"],
      },
    );

    expect(result.deliveredTo).toBe(1);
    expect(result.notFoundBuyerIds.sort()).toEqual([
      SELLER_ID,
      "64a0000000000000000000zz",
    ]);

    await flush();

    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1);
    expect(notificationRepo.created).toHaveLength(1);
  });

  it("de-duplicates repeated ids in one request", async () => {
    const result = await sendSellerNotification(
      { id: SELLER_ID, role: "SELLER" },
      { ...message, buyerIds: [BUYER_1, BUYER_1, BUYER_1] },
    );

    expect(result.requested).toBe(1);
    expect(result.deliveredTo).toBe(1);

    await flush();
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1);
  });

  it("fails when none of the selected buyers exist", async () => {
    await expect(
      sendSellerNotification(
        { id: SELLER_ID, role: "SELLER" },
        { ...message, buyerIds: ["64a0000000000000000000zz"] },
      ),
    ).rejects.toMatchObject({ code: "BUYER_NOT_FOUND", statusCode: 404 });

    expect(notificationRepo.created).toHaveLength(0);
  });

  it("keeps the single-buyer target for point-to-point sends", async () => {
    const result = await sendSellerNotification(
      { id: SELLER_ID, role: "SELLER" },
      { ...message, buyerId: BUYER_2 },
    );

    expect(result.deliveredTo).toBe(1);

    const audit = vi.mocked(logAudit).mock.calls.at(-1)?.[0];
    expect(audit?.action).toBe("SELLER_NOTIFICATION_SENT");
    expect(audit?.metadata).toMatchObject({ target: BUYER_2 });
  });

  it("broadcasts to every active buyer and audit-logs it as a broadcast", async () => {
    const result = await sendSellerNotification(
      { id: SELLER_ID, role: "SELLER" },
      { ...message, audience: "ALL_BUYERS" },
    );

    /* Three active buyers in the fixture; the seller themself is excluded. */
    expect(result.deliveredTo).toBe(3);

    const audit = vi.mocked(logAudit).mock.calls.at(-1)?.[0];
    expect(audit?.action).toBe("SELLER_NOTIFICATION_BROADCAST");
    expect(audit?.metadata).toMatchObject({
      target: "ALL_BUYERS",
      recipientCount: 3,
    });
  });

  it("keys each recipient by requestId so a retry cannot double-notify", async () => {
    const requestId = "req-12345678";

    const first = await sendSellerNotification(
      { id: SELLER_ID, role: "SELLER" },
      { ...message, buyerIds: [BUYER_1, BUYER_2], requestId },
    );
    await flush();

    expect(first.deliveredTo).toBe(2);
    expect(notificationRepo.created).toHaveLength(2);
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(2);

    /* The seller hits "Try again" after a lost response. */
    const replay = await sendSellerNotification(
      { id: SELLER_ID, role: "SELLER" },
      { ...message, buyerIds: [BUYER_1, BUYER_2], requestId },
    );

    expect(replay.deliveredTo).toBe(0);
    expect(replay.duplicates).toBe(2);
    /* No duplicate notifications, and no duplicate emails either. */
    expect(notificationRepo.created).toHaveLength(2);
    await flush();
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(2);

    /* The dedupe keys are per buyer, so one buyer cannot shadow another. */
    const keys = [...notificationRepo.store.keys()];
    expect(keys).toEqual([
      `seller-message:${SELLER_ID}:${requestId}:${BUYER_1}`,
      `seller-message:${SELLER_ID}:${requestId}:${BUYER_2}`,
    ]);
  });

  it("counts a buyer with no deliverable address as an email skip", async () => {
    const result = await sendSellerNotification(
      { id: SELLER_ID, role: "SELLER" },
      { ...message, buyerIds: [BUYER_1, BUYER_3] },
    );

    expect(result.deliveredTo).toBe(2);
    expect(result.emailsQueued).toBe(1);
    expect(result.emailsInvalidAddress).toBe(1);
  });
});

describe("failed email retry pass", () => {
  const failedRecord = (overrides: Record<string, unknown> = {}) => ({
    id: "notif-1",
    title: "Order shipped",
    message: "Your order has shipped.",
    email: "priya@gmail.com",
    emailStatus: NotificationEmailStatus.FAILED,
    emailAttempts: 1,
    ...overrides,
  });

  it("resends the email without touching the in-app notification", async () => {
    notificationRepo.listFailedEmailNotifications.mockResolvedValue([
      failedRecord(),
    ]);
    notificationRepo.claimEmailRetry.mockResolvedValue({
      _id: objectId("notif-1"),
    });

    const result = await retryFailedNotificationEmails({ limit: 5 });

    expect(result).toMatchObject({
      attempted: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    expect(sendNotificationEmailMock).toHaveBeenCalledWith(
      "priya@gmail.com",
      "Order shipped",
      expect.stringContaining("Your order has shipped."),
    );
    expect(notificationRepo.markEmailStatus).toHaveBeenCalledWith(
      "notif-1",
      NotificationEmailStatus.SENT,
    );
    /* The whole point: a retry never writes another notification. */
    expect(notificationRepo.createNotificationIfNew).not.toHaveBeenCalled();
    expect(notificationRepo.created).toHaveLength(0);
  });

  it("skips records another run already claimed, so no email is sent twice", async () => {
    notificationRepo.listFailedEmailNotifications.mockResolvedValue([
      failedRecord(),
      failedRecord({ id: "notif-2" }),
    ]);
    notificationRepo.claimEmailRetry
      .mockResolvedValueOnce({ _id: objectId("notif-1") })
      .mockResolvedValueOnce(null);
    sendNotificationEmailMock.mockRejectedValueOnce(
      new AppError("SMTP timeout", 502, "EMAIL_TIMEOUT"),
    );

    const result = await retryFailedNotificationEmails({ limit: 5 });

    expect(result.attempted).toBe(2);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(1);
    /* One round only per record: no retry storm on top of the transport's. */
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1);
    expect(notificationRepo.markEmailStatus).toHaveBeenCalledWith(
      "notif-1",
      NotificationEmailStatus.FAILED,
      { error: "SMTP timeout" },
    );
  });

  it("retires records with no deliverable address instead of retrying forever", async () => {
    notificationRepo.listFailedEmailNotifications.mockResolvedValue([
      failedRecord({ email: "broken-profile" }),
    ]);
    notificationRepo.claimEmailRetry.mockResolvedValue({
      _id: objectId("notif-1"),
    });

    const result = await retryFailedNotificationEmails({ limit: 5 });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
    expect(notificationRepo.markEmailStatus).toHaveBeenCalledWith(
      "notif-1",
      NotificationEmailStatus.INVALID_ADDRESS,
    );
  });

  it("bounds the batch it takes on", async () => {
    notificationRepo.listFailedEmailNotifications.mockResolvedValue([]);

    await retryFailedNotificationEmails({ limit: 5_000 });

    const oversizedCall =
      notificationRepo.listFailedEmailNotifications.mock.calls[0];
    expect(oversizedCall?.[0]).toBe(100);

    await retryFailedNotificationEmails({});

    const defaultCall =
      notificationRepo.listFailedEmailNotifications.mock.calls[1];
    expect(defaultCall?.[0]).toBe(25);

    /* The retry budget the query is guarded by. */
    expect(defaultCall?.[1]).toBe(10);
  });
});
