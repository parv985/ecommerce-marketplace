import { describe, expect, it } from "vitest";

import {
  PaymentMethod,
  PaymentStatus,
} from "../../src/constants/orderStatus.js";
import { RefundMethod } from "../../src/constants/payment.js";
import { planReturnRefund } from "../../src/modules/returns/return.pricing.js";
import { RETURN_APPROVED_REFUND_MESSAGE } from "../../src/constants/notificationTypes.js";

/*
 * The refund amount is decided by one pure function so the money can
 * never be influenced by a request body - these tests pin that
 * behaviour (they need no database).
 */
describe("planReturnRefund", () => {
  it("refunds the full paid amount for a cash-on-delivery order", () => {
    const plan = planReturnRefund({
      total: 499.99,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      paymentStatus: PaymentStatus.PAID,
    });

    expect(plan).toEqual({
      amount: 499.99,
      method: RefundMethod.OFFLINE,
      reason:
        "Cash-on-delivery refund for approved return",
      payable: true,
    });
  });

  it("refunds through the gateway for an online order", () => {
    const plan = planReturnRefund({
      total: 1250,
      paymentMethod: PaymentMethod.ONLINE,
      paymentStatus: PaymentStatus.PAID,
    });

    expect(plan.method).toBe(RefundMethod.GATEWAY);
    expect(plan.amount).toBe(1250);
    expect(plan.payable).toBe(true);
  });

  it("refunds only what was paid - coupon and sales discounts are not cashed out", () => {
    /*
     * order.total is already itemsTotal - discountTotal -
     * couponDiscount, so a 500 order with a 100 coupon refunds 400.
     */
    const plan = planReturnRefund({
      total: 400,
      paymentMethod: PaymentMethod.ONLINE,
      paymentStatus: PaymentStatus.PAID,
    });

    expect(plan.amount).toBe(400);
  });

  it("never invents money for an order that was not paid", () => {
    for (const paymentStatus of [
      PaymentStatus.PENDING,
      PaymentStatus.FAILED,
      PaymentStatus.REFUNDED,
    ]) {
      const plan = planReturnRefund({
        total: 900,
        paymentMethod: PaymentMethod.ONLINE,
        paymentStatus,
      });

      expect(plan.amount).toBe(0);
      expect(plan.payable).toBe(false);
      expect(plan.method).toBe(RefundMethod.NONE);
    }
  });

  it("rounds to paise", () => {
    const plan = planReturnRefund({
      total: 12.345,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      paymentStatus: PaymentStatus.PAID,
    });

    expect(plan.amount).toBe(12.35);
  });
});

/*
 * The buyer-facing confirmation is part of the contract (the API, the
 * frontend banner and the docs all quote it verbatim).
 */
describe("buyer refund notification copy", () => {
  it("uses the agreed success message", () => {
    expect(RETURN_APPROVED_REFUND_MESSAGE).toBe(
      "Your return has been approved and your refund has been processed successfully.",
    );
  });
});
