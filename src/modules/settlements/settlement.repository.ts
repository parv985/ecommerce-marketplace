import {
  Settlement,
  type ISettlement,
  type ISettlementOrder,
} from "../../models/Settlement.js";
import {
  Order,
  type IOrder,
} from "../../models/Order.js";
import type { Types } from "mongoose";
import {
  OrderStatus,
  PaymentStatus,
} from "../../constants/orderStatus.js";
import { SettlementStatus } from "../../constants/settlementStatus.js";

/*
 * Eligible orders for a period: delivered AND paid. Cancelled,
 * refunded and returned orders can never be both (a return sets the
 * order to RETURNED/REFUNDED), so they are excluded naturally - and an
 * order returned after its settlement was generated is reversed out of
 * that settlement by reverseSettlementForOrder.
 */
export const findEligibleOrdersForPeriod = async (
  periodStart: Date,
  periodEnd: Date,
): Promise<IOrder[]> => {
  return Order.find({
    status: OrderStatus.DELIVERED,
    paymentStatus: PaymentStatus.PAID,
    deliveredAt: {
      $gte: periodStart,
      $lte: periodEnd,
    },
  })
    .sort({ deliveredAt: 1 })
    .exec();
};

export const createSettlement = async (
  data: {
    sellerId: string;
    periodKey: string;
    periodStart: Date;
    periodEnd: Date;
    status: SettlementStatus;
    orders: Array<{
      orderId: Types.ObjectId;
      orderNumber: string;
      total: number;
      commissionRate: number;
      commissionAmount: number;
      sellerPayable: number;
      deliveredAt: Date;
    }>;
    totalSales: number;
    totalCommission: number;
    totalPayable: number;
    commissionRate: number;
  },
): Promise<ISettlement | null> => {
  /*
   * The unique (sellerId, periodKey) index makes concurrent
   * generation idempotent: the second insert fails with E11000 and
   * the caller returns the existing settlement.
   */
  return Settlement.create(data).catch(
    (error: unknown) => {
      const code = (
        error as { code?: number }
      )?.code;

      if (code === 11000) {
        return null;
      }

      throw error;
    },
  ) as Promise<ISettlement | null>;
};

export const findSettlementBySellerAndPeriod =
  async (
    sellerId: string,
    periodKey: string,
  ): Promise<ISettlement | null> => {
    return Settlement.findOne({
      sellerId,
      periodKey,
    }).exec();
  };

export const listSettlements = async (
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: ISettlement[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Settlement.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Settlement.countDocuments(filter).exec(),
  ]);

  return { items, total };
};

export const findSettlementById = async (
  id: string,
): Promise<ISettlement | null> => {
  return Settlement.findById(id).exec();
};

export const updateSettlementStatusById =
  async (
    id: string,
    status: SettlementStatus,
  ): Promise<ISettlement | null> => {
    const set: Record<string, unknown> = {
      status,
    };

    if (status === SettlementStatus.PAID) {
      set.paidAt = new Date();
    }

    return Settlement.findByIdAndUpdate(
      id,
      { $set: set },
      { new: true },
    ).exec();
  };

export const markReminderSent = async (
  id: string,
): Promise<ISettlement | null> => {
  return Settlement.findByIdAndUpdate(
    id,
    { $set: { reminderSentAt: new Date() } },
    { new: true },
  ).exec();
};

/*
 * -------------------------------------------------------------------
 * Return rollbacks
 * -------------------------------------------------------------------
 */

/*
 * Finds the settlement (if any) that already booked a given order,
 * together with the exact snapshot amounts recorded for it. The
 * snapshot is authoritative: commission is never recomputed from the
 * current platform rate when reversing a past settlement.
 */
export const findSettlementForOrder = async (
  sellerId: string,
  orderId: string,
): Promise<{
  settlement: ISettlement;
  entry: ISettlementOrder;
} | null> => {
  const settlement = await Settlement.findOne({
    sellerId,
    "orders.orderId": orderId,
  }).exec();

  if (!settlement) {
    return null;
  }

  const entry = settlement.orders.find((item) =>
    item.orderId.equals(orderId),
  );

  if (!entry) {
    return null;
  }

  return { settlement, entry };
};

/*
 * Pulls an order out of a settlement and reverses its contribution to
 * the three totals in one atomic update. The `orders.orderId` filter
 * makes the operation idempotent: a second (replayed) reversal matches
 * nothing and reports modifiedCount 0.
 */
export const reverseSettlementOrder = async (
  settlementId: string,
  orderId: string,
  entry: ISettlementOrder,
): Promise<boolean> => {
  const result = await Settlement.updateOne(
    {
      _id: settlementId,
      "orders.orderId": orderId,
    },
    {
      $pull: {
        orders: { orderId },
      },
      $inc: {
        totalSales: -entry.total,
        totalCommission: -entry.commissionAmount,
        totalPayable: -entry.sellerPayable,
      },
    },
  ).exec();

  return result.modifiedCount > 0;
};

/*
 * Money is stored as doubles, so an increment/decrement pair can leave
 * a sub-cent residue behind. Rounds the three totals back to 2 decimal
 * places; a no-op in the overwhelming majority of cases.
 */
export const normalizeSettlementTotals = async (
  settlementId: string,
): Promise<void> => {
  const settlement = await Settlement.findById(
    settlementId,
  ).exec();

  if (!settlement) {
    return;
  }

  const round = (value: number): number =>
    Math.round(value * 100) / 100;

  const totals = {
    totalSales: round(settlement.totalSales),
    totalCommission: round(
      settlement.totalCommission,
    ),
    totalPayable: round(settlement.totalPayable),
  };

  const drifted =
    totals.totalSales !== settlement.totalSales ||
    totals.totalCommission !==
      settlement.totalCommission ||
    totals.totalPayable !== settlement.totalPayable;

  if (!drifted) {
    return;
  }

  await Settlement.updateOne(
    { _id: settlementId },
    { $set: totals },
  ).exec();
};

/*
 * A settlement that no longer covers any order is cancelled so it can
 * never be paid out. Only PENDING settlements are touched - one that
 * is already PROCESSING/PAID keeps its state and is adjusted instead.
 */
export const cancelEmptySettlement = async (
  settlementId: string,
): Promise<ISettlement | null> => {
  return Settlement.findOneAndUpdate(
    {
      _id: settlementId,
      orders: { $size: 0 },
      status: SettlementStatus.PENDING,
    },
    { $set: { status: SettlementStatus.CANCELLED } },
    { new: true },
  ).exec();
};
