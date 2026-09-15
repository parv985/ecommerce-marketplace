import {
  PaymentMethod,
  PaymentStatus,
} from "../../constants/orderStatus.js";
import { RefundMethod } from "../../constants/payment.js";
import { roundMoney } from "../discounts/discount.pricing.js";

/*
 * Pure money maths for an approved return.
 *
 * The refund is always derived from the stored order - never from a
 * request body - and only covers money the buyer actually handed over:
 * `order.total` is already net of sales discounts and coupon discounts,
 * so a coupon never turns into extra cash on the way back.
 */

export interface RefundableOrder {
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}

export interface ReturnRefundPlan {
  /* Amount owed back to the buyer. */
  amount: number;
  method: RefundMethod;
  reason: string;
  /* False when there is nothing to move (order was never paid). */
  payable: boolean;
}

export const planReturnRefund = (
  order: RefundableOrder,
): ReturnRefundPlan => {
  if (order.paymentStatus !== PaymentStatus.PAID) {
    return {
      amount: 0,
      method: RefundMethod.NONE,
      reason:
        "No payment was captured for this order, so there is nothing to refund",
      payable: false,
    };
  }

  const amount = roundMoney(order.total);

  if (
    order.paymentMethod === PaymentMethod.ONLINE
  ) {
    return {
      amount,
      method: RefundMethod.GATEWAY,
      reason: "Full refund for approved return",
      payable: amount > 0,
    };
  }

  /*
   * Cash on delivery: the money never went through a gateway, so the
   * refund is recorded against the return and settled back to the
   * buyer by the seller (the order's revenue and commission are still
   * reversed in the same flow).
   */
  return {
    amount,
    method: RefundMethod.OFFLINE,
    reason: "Cash-on-delivery refund for approved return",
    payable: amount > 0,
  };
};
