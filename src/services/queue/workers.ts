import { sendNotificationEmail } from "../email.service.js";
import { Notification } from "../../models/Notification.js";
import { NotificationType } from "../../constants/notificationTypes.js";

/**
 * Initialize workers.
 * When Redis is not configured, jobs run synchronously inline.
 * This function logs startup status only.
 */
export const initializeWorkers = (): void => {
  console.log("[WORKER] Workers initialized (synchronous mode)");
};
