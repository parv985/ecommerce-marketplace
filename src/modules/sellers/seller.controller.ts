import type {
  Request,
  Response,
} from "express";

import { sendSuccess } from "../../utils/apiResponse.js";

import {
  getSellerProfile,
  registerSeller,
  updateSellerProfile,
} from "./seller.service.js";


export const registerSellerController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {

    const result =
      await registerSeller(
        req.body,
      );

    sendSuccess(
      res,
      "Seller registration submitted successfully",
      result,
      201,
    );
  };

export const getSellerProfileController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {

    const profile =
      await getSellerProfile(
        req.user!.id,
      );

    sendSuccess(
      res,
      "Seller profile fetched successfully",
      profile,
    );
  };

export const updateSellerProfileController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {

    const profile =
      await updateSellerProfile(
        req.user!.id,
        req.body,
      );

    sendSuccess(
      res,
      "Seller profile updated successfully",
      profile,
    );
  };
