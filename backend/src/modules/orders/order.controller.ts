import type {
  Request,
  Response,
} from "express";

import { sendSuccess } from "../../utils/apiResponse.js";

import {
  cancelOrder,
  createOrderFromCart,
  generateOrderInvoice,
  getOrderDetails,
  listMyOrders,
  markOrderPaid,
  previewCheckoutFromCart,
  updateOrderStatus,
} from "./order.service.js";

export const createOrderController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const orders = await createOrderFromCart(
    req.user!,
    req.body,
  );

  sendSuccess(
    res,
    "Order created successfully",
    orders,
    201,
  );
};

export const previewOrderController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const preview = await previewCheckoutFromCart(
    req.user!,
    req.body,
  );

  sendSuccess(
    res,
    "Checkout preview fetched successfully",
    preview,
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

export const getInvoiceController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const invoice = await generateOrderInvoice(
    req.user!,
    req.params.id,
  );

  sendSuccess(
    res,
    "Invoice generated successfully",
    invoice,
  );
};

export const getOrderTrackingController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const { getOrderTracking } = await import("./order.service.js");
  const tracking = await getOrderTracking(
    req.user!,
    req.params.id,
  );

  sendSuccess(
    res,
    "Order tracking fetched successfully",
    tracking,
  );
};
