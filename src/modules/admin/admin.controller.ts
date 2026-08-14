import type {
  Request,
  Response,
} from "express";

import { sendSuccess } from "../../utils/apiResponse.js";

import {
  getAdminOrdersList,
  getAdminProductsList,
  getSellersList,
  getUsersList,
  setProductStatus,
  setSellerStatus,
  setUserActiveStatus,
} from "./admin.service.js";

export const listUsersController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await getUsersList(
    req.query,
  );

  sendSuccess(
    res,
    "Users fetched successfully",
    result,
  );
};

export const updateUserStatusController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const user = await setUserActiveStatus(
    req.params.id,
    req.body,
  );

  sendSuccess(
    res,
    "User status updated",
    user,
  );
};

export const listSellersController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await getSellersList(
    req.query,
  );

  sendSuccess(
    res,
    "Sellers fetched successfully",
    result,
  );
};

export const updateSellerStatusController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const seller = await setSellerStatus(
      req.params.id,
      req.body,
    );

    sendSuccess(
      res,
      "Seller status updated",
      seller,
    );
  };

export const listProductsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await getAdminProductsList(
    req.query,
  );

  sendSuccess(
    res,
    "Products fetched successfully",
    result,
  );
};

export const updateProductStatusController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const product = await setProductStatus(
      req.params.id,
      req.body,
    );

    sendSuccess(
      res,
      "Product status updated",
      product,
    );
  };

export const listOrdersController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await getAdminOrdersList(
    req.query,
  );

  sendSuccess(
    res,
    "Orders fetched successfully",
    result,
  );
};
