import { UserRole } from "../../constants/roles.js";
import { SettlementStatus } from "../../constants/settlementStatus.js";
import { AppError } from "../../errors/AppError.js";
import type { ISettlement } from "../../models/Settlement.js";
import { logAudit } from "../../services/audit.service.js";
import { notifyUser } from "../notifications/notification.service.js";
import {
  NotificationChannel,
  NotificationType,
} from "../../constants/notificationTypes.js";
import { calculateCommission, getCommissionRate } from "./commission.service.js";
import {
  cancelEmptySettlement,
  createSettlement,
  findEligibleOrdersForPeriod,
  findSettlementById,
  findSettlementBySellerAndPeriod,
  findSettlementForOrder,
  listSettlements,
  markReminderSent,
  normalizeSettlementTotals,
  reverseSettlementOrder,
  updateSettlementStatusById,
} from "./settlement.repository.js";
import {
  generateSettlementSchema,
  listSettlementsQuerySchema,
  sellerSettlementQuerySchema,
  settlementIdParamsSchema,
  type GenerateSettlementInput,
  type ListSettlementsQuery,
  type SellerSettlementQuery,
} from "./settlement.schema.js";
import type {
  PaginatedSettlements,
  SettlementResponse,
} from "./settlement.types.js";

/*
 * Allowed status transitions. Anything not listed is rejected, so a
 * paid settlement can never be reopened or re-processed.
 */
const TRANSITIONS: Record<
  SettlementStatus,
  SettlementStatus[]
> = {
  [SettlementStatus.PENDING]: [
    SettlementStatus.PROCESSING,
    SettlementStatus.CANCELLED,
  ],
  [SettlementStatus.PROCESSING]: [
    SettlementStatus.PAID,
    SettlementStatus.FAILED,
  ],
  [SettlementStatus.FAILED]: [
    SettlementStatus.PROCESSING,
    SettlementStatus.CANCELLED,
  ],
  [SettlementStatus.PAID]: [],
  [SettlementStatus.CANCELLED]: [],
};

const toSettlementResponse = (
  settlement: ISettlement,
): SettlementResponse => {
  return {
    id: settlement._id.toString(),
    sellerId: settlement.sellerId.toString(),
    periodKey: settlement.periodKey,
    periodStart: settlement.periodStart,
    periodEnd: settlement.periodEnd,
    status: settlement.status,
    orders: settlement.orders.map((order) => ({
      orderId: order.orderId.toString(),
      orderNumber: order.orderNumber,
      total: order.total,
      commissionRate: order.commissionRate,
      commissionAmount: order.commissionAmount,
      sellerPayable: order.sellerPayable,
      deliveredAt: order.deliveredAt,
    })),
    totalSales: settlement.totalSales,
    totalCommission: settlement.totalCommission,
    totalPayable: settlement.totalPayable,
    commissionRate: settlement.commissionRate,
    paidAt: settlement.paidAt ?? null,
    reminderSentAt:
      settlement.reminderSentAt ?? null,
    createdAt: settlement.createdAt,
    updatedAt: settlement.updatedAt,
  };
};

const periodBounds = (
  monthKey: string,
): { periodKey: string; periodStart: Date; periodEnd: Date } => {
  const [year, month] = monthKey
    .split("-")
    .map(Number);

  const periodStart = new Date(
    Date.UTC(year!, month! - 1, 1),
  );

  /*
   * The 0th day of the next month is the last day of this month;
   * the +1 day offset includes the entire final day.
   */
  const periodEnd = new Date(
    Date.UTC(year!, month!, 0, 23, 59, 59, 999),
  );

  return { periodKey: monthKey, periodStart, periodEnd };
};

const currentMonthKey = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
};

/*
 * Seller-facing notification used for both generation and payout.
 */
const notifySettlement = async (
  settlement: ISettlement,
  title: string,
  message: string,
): Promise<void> => {
  try {
    await notifyUser({
      recipientId: settlement.sellerId.toString(),
      type: NotificationType.SETTLEMENT,
      title,
      message,
      entityType: "SETTLEMENT",
      entityId: settlement._id.toString(),
      channel: NotificationChannel.IN_APP,
      emailCategory: "payment",
    });
  } catch (error) {
    console.error(
      "[SETTLEMENT] Notification failed:",
      error,
    );
  }
};

/*
 * ---------------------------------------------------------------------
 * Generation (admin) - idempotent per (seller, period)
 * ---------------------------------------------------------------------
 */

export const generateSettlements = async (
  actor: { id: string; role: string },
  input: unknown,
): Promise<SettlementResponse[]> => {
  const data: GenerateSettlementInput =
    generateSettlementSchema.parse(input);

  const { periodKey, periodStart, periodEnd } =
    periodBounds(data.month);

  /* Snapshot the rate once for the whole run. */
  const rate = await getCommissionRate();

  const orders = await findEligibleOrdersForPeriod(
    periodStart,
    periodEnd,
  );

  const bySeller = new Map<
    string,
    typeof orders
  >();

  for (const order of orders) {
    const sellerId = order.sellerId.toString();
    const list = bySeller.get(sellerId) ?? [];
    list.push(order);
    bySeller.set(sellerId, list);
  }

  const results: SettlementResponse[] = [];

  for (const [sellerId, sellerOrders] of bySeller) {
    const existing =
      await findSettlementBySellerAndPeriod(
        sellerId,
        periodKey,
      );

    if (existing) {
      results.push(toSettlementResponse(existing));
      continue;
    }

    const orderSnapshots = sellerOrders.map(
      (order) => {
        const calc = calculateCommission(
          order.total,
          rate,
        );

        return {
          orderId: order._id,
          orderNumber: order.orderNumber,
          total: order.total,
          commissionRate: rate,
          commissionAmount: calc.commissionAmount,
          sellerPayable: calc.sellerPayable,
          deliveredAt: order.deliveredAt!,
        };
      },
    );

    const totalSales = orderSnapshots.reduce(
      (sum, order) => sum + order.total,
      0,
    );

    const totalCommission = orderSnapshots.reduce(
      (sum, order) =>
        sum + order.commissionAmount,
      0,
    );

    const totalPayable = orderSnapshots.reduce(
      (sum, order) => sum + order.sellerPayable,
      0,
    );

    const created = await createSettlement({
      sellerId,
      periodKey,
      periodStart,
      periodEnd,
      status: SettlementStatus.PENDING,
      orders: orderSnapshots,
      totalSales,
      totalCommission,
      totalPayable,
      commissionRate: rate,
    });

    /*
     * null means a concurrent request already created it (unique
     * index) - return the winner instead of double-generating.
     */
    const settlement =
      created ??
      (await findSettlementBySellerAndPeriod(
        sellerId,
        periodKey,
      )!);

    if (!settlement) {
      continue;
    }

    results.push(toSettlementResponse(settlement));

    await notifySettlement(
      settlement,
      "Settlement ready",
      `Your settlement for ${periodKey} (₹${totalPayable}) is ready for payout.`,
    );
  }

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "SETTLEMENT_GENERATED",
    entityType: "SETTLEMENT",
    metadata: {
      periodKey,
      sellers: results.length,
      commissionRate: rate,
    },
  });

  return results;
};

/*
 * ---------------------------------------------------------------------
 * Admin dashboard
 * ---------------------------------------------------------------------
 */

export const listAllSettlements = async (
  query: unknown,
): Promise<PaginatedSettlements> => {
  const parsed: ListSettlementsQuery =
    listSettlementsQuerySchema.parse(query);

  const filter: Record<string, unknown> = {};

  if (parsed.status) {
    filter.status = parsed.status;
  }

  if (parsed.sellerId) {
    filter.sellerId = parsed.sellerId;
  }

  if (parsed.month) {
    filter.periodKey = parsed.month;
  }

  const { items, total } = await listSettlements(
    filter,
    parsed.page,
    parsed.limit,
  );

  return {
    items: items.map(toSettlementResponse),
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };
};

export const getSettlementDetail = async (
  settlementId: string,
): Promise<SettlementResponse> => {
  const settlement =
    await findSettlementById(settlementId);

  if (!settlement) {
    throw new AppError(
      "Settlement not found",
      404,
      "SETTLEMENT_NOT_FOUND",
    );
  }

  return toSettlementResponse(settlement);
};

export const updateSettlementStatus = async (
  actor: { id: string; role: string },
  settlementId: string,
  nextStatus: SettlementStatus,
): Promise<SettlementResponse> => {
  const settlement =
    await findSettlementById(settlementId);

  if (!settlement) {
    throw new AppError(
      "Settlement not found",
      404,
      "SETTLEMENT_NOT_FOUND",
    );
  }

  if (nextStatus === settlement.status) {
    return toSettlementResponse(settlement);
  }

  const allowed =
    TRANSITIONS[settlement.status];

  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Cannot transition settlement from ${settlement.status} to ${nextStatus}`,
      400,
      "INVALID_SETTLEMENT_TRANSITION",
    );
  }

  const updated =
    await updateSettlementStatusById(
      settlementId,
      nextStatus,
    );

  if (!updated) {
    throw new AppError(
      "Settlement not found",
      404,
      "SETTLEMENT_NOT_FOUND",
    );
  }

  if (nextStatus === SettlementStatus.PAID) {
    await notifySettlement(
      updated,
      "Settlement paid",
      `Your settlement for ${updated.periodKey} (₹${updated.totalPayable}) has been paid out.`,
    );
  }

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "SETTLEMENT_STATUS_CHANGED",
    entityType: "SETTLEMENT",
    entityId: settlementId,
    before: { status: settlement.status },
    after: { status: nextStatus },
  });

  return toSettlementResponse(updated);
};

/*
 * Sends a payout reminder email/notification to the seller.
 */
export const remindSettlement = async (
  actor: { id: string; role: string },
  settlementId: string,
): Promise<SettlementResponse> => {
  const settlement =
    await findSettlementById(settlementId);

  if (!settlement) {
    throw new AppError(
      "Settlement not found",
      404,
      "SETTLEMENT_NOT_FOUND",
    );
  }

  if (settlement.status === SettlementStatus.PAID) {
    throw new AppError(
      "Settlement is already paid",
      400,
      "INVALID_SETTLEMENT_STATE",
    );
  }

  const updated =
    await markReminderSent(settlementId);

  await notifySettlement(
    settlement,
    "Settlement payment reminder",
    `Reminder: your settlement for ${settlement.periodKey} (₹${settlement.totalPayable}) is pending payout.`,
  );

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "SETTLEMENT_REMINDER_SENT",
    entityType: "SETTLEMENT",
    entityId: settlementId,
  });

  return toSettlementResponse(updated!);
};

/*
 * ---------------------------------------------------------------------
 * Return rollbacks (platform commission / seller earnings)
 * ---------------------------------------------------------------------
 */

export interface SettlementReversal {
  /* False when no settlement had booked this order yet. */
  reversed: boolean;
  settlementId: string | null;
  periodKey: string | null;
  /* Seller revenue taken back out of the settlement. */
  salesReversed: number;
  /* Platform commission given back (no longer earned). */
  commissionReversed: number;
  /* Seller payable removed from the settlement. */
  sellerPayableReversed: number;
  settlementStatus: SettlementStatus | null;
  /*
   * True when the money had already gone out to the seller: the
   * ledger is still corrected, and the reversed payable is what the
   * platform claws back at the next settlement.
   */
  alreadyPaidOut: boolean;
}

const EMPTY_REVERSAL: SettlementReversal = {
  reversed: false,
  settlementId: null,
  periodKey: null,
  salesReversed: 0,
  commissionReversed: 0,
  sellerPayableReversed: 0,
  settlementStatus: null,
  alreadyPaidOut: false,
};

/*
 * Reverses a returned order out of the settlement that booked it, so
 * seller earnings and platform commission only ever cover sales that
 * actually stuck.
 *
 * The snapshot amounts stored on the settlement are the ones reversed
 * (never a recalculation from today's commission rate), and the pull
 * is guarded on the order still being present, which makes a replayed
 * reversal a no-op.
 */
export const reverseSettlementForOrder = async (
  order: { _id: { toString(): string }; sellerId: { toString(): string } },
): Promise<SettlementReversal> => {
  const found = await findSettlementForOrder(
    order.sellerId.toString(),
    order._id.toString(),
  );

  if (!found) {
    return EMPTY_REVERSAL;
  }

  const { settlement, entry } = found;
  const settlementId = settlement._id.toString();

  const reversed = await reverseSettlementOrder(
    settlementId,
    order._id.toString(),
    entry,
  );

  /*
   * Already reversed by a concurrent/resumed approval - report
   * nothing so the caller does not double-count the adjustment.
   */
  if (!reversed) {
    return EMPTY_REVERSAL;
  }

  await normalizeSettlementTotals(settlementId);

  const updated =
    (await cancelEmptySettlement(settlementId)) ??
    (await findSettlementById(settlementId));

  return {
    reversed: true,
    settlementId,
    periodKey: settlement.periodKey,
    salesReversed: entry.total,
    commissionReversed: entry.commissionAmount,
    sellerPayableReversed: entry.sellerPayable,
    settlementStatus: updated?.status ?? null,
    alreadyPaidOut:
      settlement.status === SettlementStatus.PAID,
  };
};

/*
 * ---------------------------------------------------------------------
 * Seller self-service
 * ---------------------------------------------------------------------
 */

export const getSellerSettlement = async (
  user: { id: string; role: UserRole },
  query: unknown,
): Promise<SettlementResponse | null> => {
  const parsed: SellerSettlementQuery =
    sellerSettlementQuerySchema.parse(query);

  const periodKey =
    parsed.month ?? currentMonthKey();

  const settlement =
    await findSettlementBySellerAndPeriod(
      user.id,
      periodKey,
    );

  if (!settlement) {
    return null;
  }

  return toSettlementResponse(settlement);
};
