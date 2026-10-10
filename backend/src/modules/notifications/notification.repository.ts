import {
  Notification,
  NotificationEmailStatus,
  type INotification,
} from "../../models/Notification.js";
import {
  NotificationPreference,
  type INotificationPreference,
} from "../../models/NotificationPreference.js";

export const createNotification = async (
  data: Record<string, unknown>,
): Promise<INotification> => {
  return Notification.create(data);
};

/*
 * Duplicate-safe insert used by the event pipeline: when the payload
 * carries a dedupeKey, a racing insert of the same key loses on the
 * unique index (E11000) and is reported as `null` so the caller can
 * skip the email - the first insert already owns that event.
 */
export const createNotificationIfNew = async (
  data: Record<string, unknown>,
): Promise<INotification | null> => {
  try {
    return await Notification.create(data);
  } catch (error) {
    const isDuplicateKey =
      typeof error === "object" &&
      error !== null &&
      (error as { code?: number }).code === 11000;

    if (isDuplicateKey) {
      return null;
    }

    throw error;
  }
};

export const findNotificationByDedupeKey = async (
  dedupeKey: string,
): Promise<INotification | null> => {
  return Notification.findOne({ dedupeKey }).exec();
};

/*
 * Records the outcome of an email dispatch on the notification that
 * produced it. `emailAttempts` counts dispatch rounds (a round already
 * includes the transport-level retries inside sendNotificationEmail) and
 * is what the retry budget guard reads; `error` keeps the sanitized
 * failure reason for operators. Marking a status never creates a
 * notification - the in-app record is written once, by
 * createNotificationIfNew - so a retried email can never duplicate it.
 */
export const markEmailStatus = async (
  id: string,
  status: NotificationEmailStatus,
  options?: { error?: string | null },
): Promise<void> => {
  const message = options?.error
    ? options.error.slice(0, 500)
    : null;

  await Notification.updateOne(
    { _id: id },
    {
      $set: {
        emailStatus: status,
        emailError: message,
        ...(status === NotificationEmailStatus.SENT
          ? { emailSentAt: new Date() }
          : {}),
      },
      $inc: {
        emailAttempts: 1,
      },
    },
  ).exec();
};

/*
 * Email copy of one notification, as far as the retry path needs it:
 * the persisted content plus the recipient's registered address.
 */
export interface RetryableEmailNotification {
  id: string;
  title: string;
  message: string;
  email: string | null;
  emailStatus: NotificationEmailStatus;
  emailAttempts: number;
}

/* A notification whose recipientId was replaced by the user document. */
type PopulatedRecipient = Omit<INotification, "recipientId"> & {
  recipientId: { email?: string } | null;
};

/*
 * Which failed records a retry round may take on.
 *
 * Documents written before `emailAttempts` existed have no such field at
 * all, and a plain `{ $lt: n }` never matches a missing field - so the
 * counter is treated as "0 when absent" here instead of hiding those
 * notifications from the retry pass forever.
 */
const retryEligibleFilter = (
  maxAttempts: number,
): Record<string, unknown> => ({
  emailStatus: NotificationEmailStatus.FAILED,
  $or: [
    { emailAttempts: { $lt: maxAttempts } },
    { emailAttempts: { $exists: false } },
  ],
});

/*
 * Failed email copies, oldest first, that still have retry budget.
 * Backed by the partial index on { emailStatus: FAILED }.
 */
export const listFailedEmailNotifications = async (
  limit: number,
  maxAttempts: number,
): Promise<RetryableEmailNotification[]> => {
  const notifications = await Notification.find(
    retryEligibleFilter(maxAttempts),
  )
    .sort({ createdAt: 1 })
    .limit(limit)
    .populate<PopulatedRecipient>("recipientId", "email")
    .exec();

  return notifications.map((notification) => ({
    id: notification._id.toString(),
    title: notification.title,
    message: notification.message,
    email: notification.recipientId?.email ?? null,
    emailStatus: notification.emailStatus,
    emailAttempts: notification.emailAttempts ?? 0,
  }));
};

/*
 * Atomic claim for one retry round: FAILED -> PENDING.
 *
 * Two overlapping retry requests (double-click, cron + manual run) race
 * on this filter; exactly one of them sees the document still FAILED and
 * gets it back. The loser receives null and skips the notification, which
 * is what keeps a retry from sending the same email twice. No in-app
 * record is ever written here, so a retry cannot duplicate the
 * notification either.
 */
export const claimEmailRetry = async (
  id: string,
  maxAttempts: number,
): Promise<INotification | null> => {
  return Notification.findOneAndUpdate(
    {
      _id: id,
      ...retryEligibleFilter(maxAttempts),
    },
    {
      $set: {
        emailStatus: NotificationEmailStatus.PENDING,
      },
    },
    { new: true },
  )
    .select("_id")
    .exec();
};

/*
 * Backlog size for the retry endpoint's response: how many notifications
 * still have an email copy that never arrived.
 */
export const countFailedEmails = async (): Promise<number> => {
  return Notification.countDocuments({
    emailStatus: NotificationEmailStatus.FAILED,
  }).exec();
};

export const listNotificationsForUser = async (
  userId: string,
  unreadOnly: boolean,
  page: number,
  limit: number,
): Promise<{
  items: INotification[];
  total: number;
}> => {
  const filter: Record<string, unknown> = {
    recipientId: userId,
  };

  if (unreadOnly) {
    filter.isRead = false;
  }

  const [items, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Notification.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

export const countUnreadForUser = async (
  userId: string,
): Promise<number> => {
  return Notification.countDocuments({
    recipientId: userId,
    isRead: false,
  }).exec();
};

export const findNotificationByIdAndUser = async (
  id: string,
  userId: string,
): Promise<INotification | null> => {
  return Notification.findOne({
    _id: id,
    recipientId: userId,
  }).exec();
};

export const markNotificationRead = async (
  id: string,
): Promise<INotification | null> => {
  return Notification.findByIdAndUpdate(
    id,
    {
      $set: { isRead: true },
    },
    {
      new: true,
    },
  ).exec();
};

export const markAllNotificationsRead = async (
  userId: string,
): Promise<number> => {
  const result = await Notification.updateMany(
    {
      recipientId: userId,
      isRead: false,
    },
    {
      $set: { isRead: true },
    },
  ).exec();

  return result.modifiedCount;
};

export const findPreferenceByUserId = async (
  userId: string,
): Promise<INotificationPreference | null> => {
  return NotificationPreference.findOne({
    userId,
  }).exec();
};

export const createDefaultPreference = async (
  userId: string,
): Promise<INotificationPreference> => {
  return NotificationPreference.create({
    userId,
    emailOrderUpdates: true,
    emailPaymentUpdates: true,
    emailPromotional: true,
    inApp: true,
  });
};

export const updatePreferenceByUserId = async (
  userId: string,
  data: Record<string, unknown>,
): Promise<INotificationPreference | null> => {
  return NotificationPreference.findOneAndUpdate(
    { userId },
    {
      $set: data,
    },
    {
      new: true,
      upsert: true,
    },
  ).exec();
};
