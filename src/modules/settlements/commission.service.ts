import { PlatformSetting } from "../../models/PlatformSetting.js";
import { roundMoney } from "../discounts/discount.pricing.js";

/*
 * Configurable platform commission.
 *
 * The rate lives in the PlatformSetting collection (default 10%) and
 * is NEVER hardcoded in business logic. Historical settlements
 * snapshot the rate they were generated with, so later changes to the
 * configuration never retroactively change past payouts.
 */

const COMMISSION_KEY = "COMMISSION_RATE";

const DEFAULT_COMMISSION_RATE = 10;

export const getCommissionRate =
  async (): Promise<number> => {
    const setting = await PlatformSetting.findOne(
      { key: COMMISSION_KEY },
    ).exec();

    if (setting) {
      return setting.value;
    }

    /*
     * Lazy seed on first read so the system works without a manual
     * settings step. The create is idempotent by the unique key.
     */
    await PlatformSetting.findOneAndUpdate(
      { key: COMMISSION_KEY },
      {
        $setOnInsert: {
          value: DEFAULT_COMMISSION_RATE,
        },
      },
      { upsert: true },
    ).exec();

    return DEFAULT_COMMISSION_RATE;
  };

export const setCommissionRate = async (
  rate: number,
): Promise<number> => {
  await PlatformSetting.findOneAndUpdate(
    { key: COMMISSION_KEY },
    { $set: { value: rate } },
    { upsert: true, new: true },
  ).exec();

  return rate;
};

/*
 * Pure calculation: seller revenue -> platform commission -> seller
 * payable. Always rounded to 2 decimal places so ledger amounts are
 * exact.
 */
export const calculateCommission = (
  amount: number,
  rate: number,
): {
  commissionRate: number;
  commissionAmount: number;
  sellerPayable: number;
} => {
  const commissionAmount = roundMoney(
    (amount * rate) / 100,
  );

  return {
    commissionRate: rate,
    commissionAmount,
    sellerPayable: roundMoney(
      amount - commissionAmount,
    ),
  };
};
