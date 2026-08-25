import type { Request, Response } from "express";

import { getSellerSettlement } from "./settlement.service.js";

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
