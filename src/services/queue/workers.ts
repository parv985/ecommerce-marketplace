import {
  emailQueue,
  notificationQueue,
  type EmailJobData,
  type NotificationJobData,
} from "./queue.config.js";
import { sendNotificationEmail } from "../email.service.js";
import { User } from "../../models/User.js";
import { Notification } from "../../models/Notification.js";
import { NotificationType } from "../../constants/notificationTypes.js";

/**
 * Initialize queue workers when Redis is available.
 * Workers process jobs in the background so HTTP requests
 * don't block on email delivery or notification creation.
 */
export const initializeWorkers = (): void => {
  if (emailQueue) {
    emailQueue.process("send-email", async (job) => {
      const data: EmailJobData = job.data;

      console.log(`[WORKER] Processing email job: ${data.subject} -> ${data.to}`);

      await sendNotificationEmail(data.to, data.subject, data.text);
    });

    emailQueue.on("failed", (job, err) => {
      console.error(`[WORKER] Email job ${job.id} failed:`, err.message);
    });

    emailQueue.on("completed", (job) => {
      console.log(`[WORKER] Email job ${job.id} completed`);
    });

    console.log("[WORKER] Email worker initialized");
  }

  if (notificationQueue) {
    notificationQueue.process("send-notification", async (job) => {
      const data: NotificationJobData = job.data;

      console.log(`[WORKER] Processing notification: ${data.title} -> ${data.recipientId}`);

      await Notification.create({
        recipientId: data.recipientId,
        type: data.type as NotificationType,
        title: data.title,
        message: data.message,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        isRead: false,
      });
    });

    notificationQueue.on("failed", (job, err) => {
      console.error(`[WORKER] Notification job ${job.id} failed:`, err.message);
    });

    notificationQueue.on("completed", (job) => {
      console.log(`[WORKER] Notification job ${job.id} completed`);
    });

    console.log("[WORKER] Notification worker initialized");
  }
};
