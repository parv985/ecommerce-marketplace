import Queue from "bull";
import { env } from "../../config/env.js";

/**
 * Job queue configuration for background processing.
 * Uses Bull (Redis-backed) when REDIS_URL is configured,
 * otherwise falls back to in-memory processing.
 *
 * Jobs are idempotent where possible and include retry logic
 * with exponential backoff.
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

const REDIS_URL = process.env.REDIS_URL;

/**
 * Creates a Bull queue if Redis is available.
 * Returns null when Redis is not configured, allowing
 * graceful fallback to synchronous processing.
 */
const createQueue = <T>(
  name: string,
): Queue.Queue<T> | null => {
  if (!REDIS_URL) {
    console.log(`[QUEUE] Redis not configured, ${name} will run synchronously`);
    return null;
  }

  const queue = new Queue<T>(name, {
    redis: {
      host: new URL(REDIS_URL).hostname,
      port: Number(new URL(REDIS_URL).port) || 6379,
      password: new URL(REDIS_URL).password || undefined,
    },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  });

  return queue;
};

export const emailQueue = createQueue<EmailJobData>("email");
export const notificationQueue =
  createQueue<NotificationJobData>("notification");

/**
 * Adds a job to the queue. Falls back to direct processing
 * when Redis is not available.
 */
export const addJob = async <T>(
  queue: Queue.Queue<T> | null,
  jobName: string,
  data: T,
  handler?: (data: T) => Promise<void>,
): Promise<void> => {
  if (queue) {
    await queue.add(jobName, data);
    console.log(`[QUEUE] Job "${jobName}" added to queue`);
  } else if (handler) {
    // Fallback: process synchronously
    try {
      await handler(data);
    } catch (error) {
      console.error(`[QUEUE] Synchronous job "${jobName}" failed:`, error);
    }
  }
};

/**
 * Graceful shutdown: close all queues.
 */
export const closeQueues = async (): Promise<void> => {
  if (emailQueue) await emailQueue.close();
  if (notificationQueue) await notificationQueue.close();
};
