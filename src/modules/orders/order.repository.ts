import {
  Order,
  type IOrder,
} from "../../models/Order.js";
import { Seller } from "../../models/Seller.js";

export const createOrders = async (
  orders: Array<Record<string, unknown>>,
): Promise<IOrder[]> => {
  const created = await Order.insertMany(orders);

  /*
   * insertMany returns hydrated documents; the static type omits
   * server-generated fields, so narrow it back to IOrder.
   */
  return created as unknown as IOrder[];
};

export const findOrderById = async (
  id: string,
): Promise<IOrder | null> => {
  return Order.findById(id).exec();
};

export const listOrdersByUser = async (
  userId: string,
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: IOrder[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Order.find({ userId, ...filter })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Order.countDocuments({
      userId,
      ...filter,
    }).exec(),
  ]);

  return { items, total };
};

export const listOrdersBySeller = async (
  sellerId: string,
  filter: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<{
  items: IOrder[];
  total: number;
}> => {
  const [items, total] = await Promise.all([
    Order.find({ sellerId, ...filter })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Order.countDocuments({
      sellerId,
      ...filter,
    }).exec(),
  ]);

  return { items, total };
};

export const updateOrderStatusById = async (
  id: string,
  status: string,
  deliveredAt?: Date | null,
): Promise<IOrder | null> => {
  return Order.findByIdAndUpdate(
    id,
    {
      $set: {
        status,
        ...(deliveredAt !== undefined && {
          deliveredAt,
        }),
      },
    },
    {
      new: true,
    },
  ).exec();
};

/*
 * Removes an applied coupon from an order and restores the original
 * payable amount. Used to roll back a coupon when recording its usage
 * fails after the order was created (rare race), so the discount is
 * never leaked without a usage record.
 */
export const resetOrderCoupon = async (
  id: string,
): Promise<IOrder | null> => {
  return Order.findByIdAndUpdate(
    id,
    [
      {
        $set: {
          couponId: null,
          couponCode: null,
          couponDiscount: 0,
          total: {
            $subtract: [
              "$itemsTotal",
              "$discountTotal",
            ],
          },
        },
      },
    ],
    {
      new: true,
    },
  ).exec();
};

export const updateOrderPaymentStatusById = async (
  id: string,
  paymentStatus: string,
): Promise<IOrder | null> => {
  return Order.findByIdAndUpdate(
    id,
    {
      $set: { paymentStatus },
    },
    {
      new: true,
    },
  ).exec();
};

export const updateOrderPaymentIdById = async (
  id: string,
  paymentId: string,
): Promise<IOrder | null> => {
  return Order.findByIdAndUpdate(
    id,
    {
      $set: { paymentId },
    },
    {
      new: true,
    },
  ).exec();
};

/*
 * Resolves seller business names for a batch of seller user ids.
 */
export const findSellerBusinessNames = async (
  sellerIds: string[],
): Promise<Map<string, string>> => {
  const sellers = await Seller.find({
    userId: { $in: sellerIds },
  })
    .select("userId businessName")
    .exec();

  const map = new Map<string, string>();

  for (const seller of sellers) {
    map.set(
      seller.userId.toString(),
      seller.businessName,
    );
  }

  return map;
};
