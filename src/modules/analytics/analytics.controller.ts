import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/apiResponse.js";
import {
  getCategoryPerformance,
  getSalesSeries,
  getSellerCustomers,
  getSellerDashboard,
  getSellerRevenue,
  getTopProducts,
} from "./analytics.service.js";

export const dashboardController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await getSellerDashboard(
    req.user!.id,
  );

  sendSuccess(
    res,
    "Dashboard fetched successfully",
    data,
  );
};

export const salesSeriesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await getSalesSeries(
    req.user!.id,
    req.query,
  );

  sendSuccess(
    res,
    "Sales analytics fetched successfully",
    data,
  );
};

export const topProductsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await getTopProducts(
    req.user!.id,
    req.query,
  );

  sendSuccess(
    res,
    "Top products fetched successfully",
    data,
  );
};

export const categoryPerformanceController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await getCategoryPerformance(
    req.user!.id,
  );

  sendSuccess(
    res,
    "Category performance fetched successfully",
    data,
  );
};

export const customersController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await getSellerCustomers(
    req.user!.id,
    req.query,
  );

  sendSuccess(
    res,
    "Customers fetched successfully",
    data,
  );
};

export const revenueController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await getSellerRevenue(
    req.user!.id,
    req.query,
  );

  sendSuccess(
    res,
    "Revenue statistics fetched successfully",
    data,
  );
};
