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

export const markEmailStatus = async (
  id: string,
  status: NotificationEmailStatus,
): Promise<void> => {
  await Notification.updateOne(
    { _id: id },
    {
      $set: {
        emailStatus: status,
        ...(status === NotificationEmailStatus.SENT
          ? { emailSentAt: new Date() }
          : {}),
      },
    },
  ).exec();
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
