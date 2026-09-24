import type { Request, Response } from "express";

import {
  getSellerSettlement,
  getSellerSettlements,
  createSettlementPaymentOrder,
  verifySettlementPayment,
} from "./settlement.service.js";

export const getMySettlementController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const settlement = await getSellerSettlement(
    req.user!,
    req.query,
  );

  res.status(200).json({
    success: true,
    message: settlement
      ? "Settlement fetched successfully"
      : "No settlement found for this period",
    data: settlement,
  });
};

export const getMySettlementsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await getSellerSettlements(
    req.user!,
    req.query,
  );

  res.status(200).json({
    success: true,
    message: "Settlements fetched successfully",
    data: result,
  });
};

export const createSettlementPaymentOrderController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const result = await createSettlementPaymentOrder(
    req.user!,
    req.params.id,
  );

  res.status(200).json({
    success: true,
    message: "Payment order created",
    data: result,
  });
};

export const verifySettlementPaymentController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const result = await verifySettlementPayment(
    req.user!,
    req.params.id,
    req.body,
  );

  res.status(200).json({
    success: true,
    message: "Settlement payment verified",
    data: result,
  });
};
