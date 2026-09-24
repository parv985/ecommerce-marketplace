import { sellerService } from './seller.service'

export const settlementService = {
  getSettlement: sellerService.getSettlement,
  getSettlements: sellerService.getSettlements,
  createPaymentOrder: sellerService.createSettlementPaymentOrder,
  verifyPayment: sellerService.verifySettlementPayment,
}
