import {
  ReturnRequest,
  type IReturnRequest,
} from "../../models/ReturnRequest.js";
import { ReturnStatus } from "../../constants/returnStatus.js";

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
