import {
  Notification,
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
