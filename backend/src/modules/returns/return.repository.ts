import {
  ReturnRequest,
  type IReturnRefund,
  type IReturnRequest,
} from "../../models/ReturnRequest.js";
import { ReturnStatus } from "../../constants/returnStatus.js";
import { RefundStatus } from "../../constants/payment.js";

export const createReturn = async (
  data: Record<string, unknown>,
): Promise<IReturnRequest> => {
  return ReturnRequest.create(data);
};

export const findReturnById = async (
  id: string,
): Promise<IReturnRequest | null> => {
  return ReturnRequest.findById(id).exec();
};

/*
 * Any return that is still in flight for the order (a new request is
 * rejected while one exists).
 */
export const findActiveReturnByOrder = async (
  orderId: string,
): Promise<IReturnRequest | null> => {
  return ReturnRequest.findOne({
    orderId,
    status: {
      $in: [
        ReturnStatus.PENDING,
        ReturnStatus.APPROVED,
        ReturnStatus.COMPLETED,
      ],
    },
  }).exec();
};

export const findReturnByIdAndUser = async (
  id: string,
  userId: string,
): Promise<IReturnRequest | null> => {
  return ReturnRequest.findOne({
    _id: id,
    userId,
  }).exec();
};

export const findReturnByIdAndSeller = async (
  id: string,
  sellerId: string,
): Promise<IReturnRequest | null> => {
  return ReturnRequest.findOne({
    _id: id,
    sellerId,
  }).exec();
};

export const listReturnsByUser = async (
  userId: string,
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: IReturnRequest[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    ReturnRequest.find({ userId, ...filter })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    ReturnRequest.countDocuments({
      userId,
      ...filter,
    }).exec(),
  ]);

  return { items, total };
};

export const listReturnsBySeller = async (
  sellerId: string,
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: IReturnRequest[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    ReturnRequest.find({ sellerId, ...filter })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    ReturnRequest.countDocuments({
      sellerId,
      ...filter,
    }).exec(),
  ]);

  return { items, total };
};

export const updateReturnStatusById = async (
  id: string,
  status: ReturnStatus,
  statusReason?: string | null,
): Promise<IReturnRequest | null> => {
  return ReturnRequest.findByIdAndUpdate(
    id,
    {
      $set: {
        status,
        ...(statusReason !== undefined && {
          statusReason: statusReason ?? null,
        }),
      },
    },
    {
      new: true,
    },
  ).exec();
};

/*
 * Approval claim - the duplicate-refund guard.
 *
 * Flipping PENDING -> APPROVED is a single conditional update, so when
 * the approval endpoint is hit twice (double click, retry, two sellers
 * on the same account) exactly one caller wins and every other caller
 * gets `null` back. Only the winner runs the refund pipeline; the
 * losers read the resulting state and return it unchanged.
 */
export const claimReturnForApproval = async (
  id: string,
  patch: {
    refund: IReturnRefund;
    decidedBy: string;
    decidedRole: string;
    statusReason?: string | null | undefined;
  },
): Promise<IReturnRequest | null> => {
  return ReturnRequest.findOneAndUpdate(
    {
      _id: id,
      status: ReturnStatus.PENDING,
      /* Belt and braces: never claim a return that already refunded. */
      "refund.status": {
        $ne: RefundStatus.PROCESSED,
      },
    },
    {
      $set: {
        status: ReturnStatus.APPROVED,
        approvedAt: new Date(),
        decidedBy: patch.decidedBy,
        decidedRole: patch.decidedRole,
        refund: patch.refund,
        ...(patch.statusReason !== undefined && {
          statusReason: patch.statusReason ?? null,
        }),
      },
    },
    { new: true },
  ).exec();
};

/*
 * Records the refund outcome on the return. Only applied while the
 * refund is not already PROCESSED, so a resumed approval can never
 * overwrite a completed refund with a second one.
 */
export const markReturnRefundProcessed = async (
  id: string,
  refund: IReturnRefund,
): Promise<IReturnRequest | null> => {
  return ReturnRequest.findOneAndUpdate(
    {
      _id: id,
      "refund.status": {
        $ne: RefundStatus.PROCESSED,
      },
    },
    { $set: { refund } },
    { new: true },
  ).exec();
};

/* Marks the refund attempt as failed and leaves the return PENDING so
 * the seller can retry (nothing was moved, so a retry is safe). */
export const releaseFailedApproval = async (
  id: string,
  refund: IReturnRefund,
): Promise<IReturnRequest | null> => {
  return ReturnRequest.findOneAndUpdate(
    {
      _id: id,
      status: ReturnStatus.APPROVED,
      "refund.status": {
        $ne: RefundStatus.PROCESSED,
      },
    },
    {
      $set: {
        status: ReturnStatus.PENDING,
        approvedAt: null,
        decidedBy: null,
        decidedRole: null,
        refund,
      },
    },
    { new: true },
  ).exec();
};

/*
 * Stock-restoration claim. The first caller to see
 * `stockRestoredAt: null` wins and stamps the timestamp, so repeated
 * approvals (or approving and later completing) credit the inventory
 * exactly once.
 */
export const claimReturnStockRestore = async (
  id: string,
): Promise<IReturnRequest | null> => {
  return ReturnRequest.findOneAndUpdate(
    {
      _id: id,
      stockRestoredAt: null,
    },
    { $set: { stockRestoredAt: new Date() } },
    { new: true },
  ).exec();
};

export const markReturnCompleted = async (
  id: string,
): Promise<IReturnRequest | null> => {
  return ReturnRequest.findOneAndUpdate(
    {
      _id: id,
      status: ReturnStatus.APPROVED,
    },
    {
      $set: {
        status: ReturnStatus.COMPLETED,
      },
    },
    { new: true },
  ).exec();
};
