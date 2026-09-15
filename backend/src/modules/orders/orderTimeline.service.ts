import { OrderTimeline } from "../../models/OrderTimeline.js";
import { OrderStatus } from "../../constants/orderStatus.js";

/**
 * Records a status change in the order timeline.
 * Called whenever an order status is updated.
 */
export const recordOrderTimeline = async (input: {
  orderId: string;
  status: OrderStatus;
  actorId: string;
  actorRole: string;
  reason?: string;
}): Promise<void> => {
  await OrderTimeline.create({
    orderId: input.orderId,
    status: input.status,
    actorId: input.actorId,
    actorRole: input.actorRole,
    ...(input.reason !== undefined && { reason: input.reason }),
  });
};

/**
 * Gets the chronological timeline for an order.
 */
export const getOrderTimeline = async (
  orderId: string,
): Promise<Array<{
  status: OrderStatus;
  actorId: string;
  actorRole: string;
  reason: string | null;
  createdAt: Date;
}>> => {
  const entries = await OrderTimeline.find({
    orderId,
  })
    .sort({ createdAt: 1 })
    .exec();

  return entries.map((entry) => ({
    status: entry.status,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    reason: entry.reason ?? null,
    createdAt: entry.createdAt,
  }));
};
