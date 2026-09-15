import type { Request, Response } from "express";

import { RefundStatus } from "../../constants/payment.js";
import { ReturnStatus } from "../../constants/returnStatus.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  cancelReturn,
  getReturn,
  listMyReturns,
  requestReturn,
  updateReturnStatus,
} from "./return.service.js";

export const requestReturnController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await requestReturn(
    req.user!,
    req.body,
  );

  sendSuccess(
    res,
    "Return request submitted",
    data,
    201,
  );
};

export const listReturnsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = await listMyReturns(
    req.user!,
    req.query,
  );

  sendSuccess(
    res,
    "Return requests fetched successfully",
    data,
  );
};

export const getReturnController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const data = await getReturn(
    req.user!,
    req.params.id,
  );

  sendSuccess(
    res,
    "Return request fetched successfully",
    data,
  );
};

export const updateReturnStatusController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const data = await updateReturnStatus(
    req.user!,
    req.params.id,
    req.body,
  );

  /*
   * Approving is more than a status change - the refund and every
   * rollback happened, so the response says so.
   */
  const refunded =
    data.status === ReturnStatus.APPROVED &&
    data.refund?.status === RefundStatus.PROCESSED;

  sendSuccess(
    res,
    refunded
      ? "Return approved and refund processed successfully"
      : "Return request updated successfully",
    data,
  );
};

export const cancelReturnController = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const data = await cancelReturn(
    req.user!,
    req.params.id,
  );

  sendSuccess(
    res,
    "Return request cancelled",
    data,
  );
};
