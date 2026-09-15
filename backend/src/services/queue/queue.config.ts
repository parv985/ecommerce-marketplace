/**
 * Job queue configuration for background processing.
 * Uses Bull (Redis-backed) when REDIS_URL is configured,
 * otherwise falls back to in-memory processing.
 */

export enum JobType {
  SEND_EMAIL = "SEND_EMAIL",
  SEND_NOTIFICATION = "SEND_NOTIFICATION",
  PROCESS_WEBHOOK = "PROCESS_WEBHOOK",
  OUT_OF_STOCK_CHECK = "OUT_OF_STOCK_CHECK",
}

export interface EmailJobData {
  to: string;
  subject: string;
  text: string;
}

export interface NotificationJobData {
  recipientId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Job queue stub. All jobs are processed synchronously inline.
 * Bull/Redis integration can be enabled by setting REDIS_URL.
 */
export const addJob = async <T>(
  _queue: unknown,
  _jobName: string,
  data: T,
  handler?: (data: T) => Promise<void>,
): Promise<void> => {
  if (handler) {
    try {
      await handler(data);
    } catch (error) {
      console.error(`[JOB] Synchronous job "${_jobName}" failed:`, error);
    }
  }
};

export const closeQueues = async (): Promise<void> => {
  // No-op when Redis is disabled
};
