import type {
  Request,
  Response,
} from "express";

import { sendSuccess } from "../../utils/apiResponse.js";

import {
  getAdminOrdersList,
  getAdminProductsList,
  getAuditLogsList,
  getSellersList,
  getUsersList,
  setProductStatus,
  setSellerStatus,
  setUserActiveStatus,
} from "./admin.service.js";
import {
  generateSettlements,
  getSettlementDetail,
  listAllSettlements,
  remindSettlement,
  updateSettlementStatus,
} from "../settlements/settlement.service.js";
import {
  getCommissionRate,
  setCommissionRate,
} from "../settlements/commission.service.js";
import { logAudit } from "../../services/audit.service.js";
import { SettlementStatus } from "../../constants/settlementStatus.js";

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
    req.user!.id,
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
      req.user!,
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

export const listAuditLogsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await getAuditLogsList(
    req.query,
  );

  sendSuccess(
    res,
    "Audit logs fetched successfully",
    result,
  );
};

export const listSettlementsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = await listAllSettlements(
    req.query,
  );

  sendSuccess(
    res,
    "Settlements fetched successfully",
    result,
  );
};

export const getSettlementController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const result = await getSettlementDetail(
    req.params.id,
  );

  sendSuccess(
    res,
    "Settlement fetched successfully",
    result,
  );
};

export const generateSettlementController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const result = await generateSettlements(
      req.user!,
      req.body,
    );

    sendSuccess(
      res,
      "Settlements generated",
      result,
      201,
    );
  };

export const processSettlementController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const result = await updateSettlementStatus(
      req.user!,
      req.params.id,
      SettlementStatus.PROCESSING,
    );

    sendSuccess(
      res,
      "Settlement processing started",
      result,
    );
  };

export const markSettlementPaidController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const result = await updateSettlementStatus(
      req.user!,
      req.params.id,
      SettlementStatus.PAID,
    );

    sendSuccess(
      res,
      "Settlement marked as paid",
      result,
    );
  };

export const cancelSettlementController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const result = await updateSettlementStatus(
      req.user!,
      req.params.id,
      SettlementStatus.CANCELLED,
    );

    sendSuccess(
      res,
      "Settlement cancelled",
      result,
    );
  };

export const failSettlementController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const result = await updateSettlementStatus(
    req.user!,
    req.params.id,
    SettlementStatus.FAILED,
  );

  sendSuccess(
    res,
    "Settlement marked as failed",
    result,
  );
};

export const remindSettlementController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const result = await remindSettlement(
      req.user!,
      req.params.id,
    );

    sendSuccess(
      res,
      "Settlement reminder sent",
      result,
    );
  };

export const getCommissionSettingsController =
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    const rate = await getCommissionRate();

    sendSuccess(
      res,
      "Commission settings fetched",
      { rate },
    );
  };

export const updateCommissionSettingsController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const before = await getCommissionRate();
    const rate = await setCommissionRate(
      req.body.rate,
    );

    await logAudit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: "COMMISSION_RATE_CHANGED",
      entityType: "PLATFORM_SETTING",
      before: { rate: before },
      after: { rate },
    });

    sendSuccess(
      res,
      "Commission settings updated",
      { rate },
    );
  };
