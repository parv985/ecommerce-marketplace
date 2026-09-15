import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/apiResponse.js";
import {
  createCouponForSeller,
  deactivateSellerCoupon,
  getSellerCoupon,
  listSellerCoupons,
  updateSellerCoupon,
} from "./coupon.service.js";

export const createCouponController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await createCouponForSeller(
    req.user!.id,
    req.body,
  );

  sendSuccess(
    res,
    "Coupon created successfully",
    data,
    201,
  );
};

export const listCouponsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await listSellerCoupons(
    req.user!.id,
    req.query,
  );

  sendSuccess(
    res,
    "Coupons fetched successfully",
    data,
  );
};

export const getCouponController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const data = await getSellerCoupon(
    req.user!.id,
    req.params.id,
  );

  sendSuccess(
    res,
    "Coupon fetched successfully",
    data,
  );
};

export const updateCouponController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const data = await updateSellerCoupon(
    req.user!.id,
    req.params.id,
    req.body,
  );

  sendSuccess(
    res,
    "Coupon updated successfully",
    data,
  );
};

export const deactivateCouponController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  await deactivateSellerCoupon(
    req.user!.id,
    req.params.id,
  );

  sendSuccess(
    res,
    "Coupon deactivated successfully",
    null,
  );
};
