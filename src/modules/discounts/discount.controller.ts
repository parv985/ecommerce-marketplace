import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/apiResponse.js";
import {
  createDiscountForSeller,
  deactivateSellerDiscount,
  getSellerDiscount,
  listSellerDiscounts,
  updateSellerDiscount,
} from "./discount.service.js";

export const createDiscountController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await createDiscountForSeller(
    req.user!.id,
    req.body,
  );

  sendSuccess(
    res,
    "Discount created successfully",
    data,
    201,
  );
};

export const listDiscountsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await listSellerDiscounts(
    req.user!.id,
    req.query,
  );

  sendSuccess(
    res,
    "Discounts fetched successfully",
    data,
  );
};

export const getDiscountController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const data = await getSellerDiscount(
    req.user!.id,
    req.params.id,
  );

  sendSuccess(
    res,
    "Discount fetched successfully",
    data,
  );
};

export const updateDiscountController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const data = await updateSellerDiscount(
    req.user!.id,
    req.params.id,
    req.body,
  );

  sendSuccess(
    res,
    "Discount updated successfully",
    data,
  );
};

export const deactivateDiscountController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  await deactivateSellerDiscount(
    req.user!.id,
    req.params.id,
  );

  sendSuccess(
    res,
    "Discount deactivated successfully",
    null,
  );
};
