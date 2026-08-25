import {
  Settlement,
  type ISettlement,
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
 * Eligible orders for a period: delivered AND paid. Cancelled or
 * refunded orders can never be both, so they are excluded naturally.
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
