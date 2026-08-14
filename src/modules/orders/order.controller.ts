import type {
  Request,
  Response,
} from "express";

import { sendSuccess } from "../../utils/apiResponse.js";

import {
  cancelOrder,
  createOrderFromCart,
  getOrderDetails,
  listMyOrders,
  markOrderPaid,
  updateOrderStatus,
} from "./order.service.js";

export const createOrderController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const orders = await createOrderFromCart(
    req.user!.id,
    req.body,
  );

  sendSuccess(
    res,
    "Order created successfully",
    orders,
    201,
  );
};

export const listOrdersController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await listMyOrders(
    req.user!,
    req.query,
  );

  sendSuccess(
    res,
    "Orders fetched successfully",
    result,
  );
};

export const getOrderController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const order = await getOrderDetails(
    req.user!,
    req.params.id,
  );

  sendSuccess(
    res,
    "Order fetched successfully",
    order,
  );
};

export const updateOrderStatusController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const order = await updateOrderStatus(
      req.user!,
      req.params.id,
      req.body,
    );

    sendSuccess(
      res,
      "Order status updated",
      order,
    );
  };

export const cancelOrderController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const order = await cancelOrder(
    req.user!,
    req.params.id,
  );

  sendSuccess(
    res,
    "Order cancelled successfully",
    order,
  );
};

export const markOrderPaidController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const order = await markOrderPaid(
    req.user!,
    req.params.id,
  );

  sendSuccess(
    res,
    "Payment marked as received",
    order,
  );
};
