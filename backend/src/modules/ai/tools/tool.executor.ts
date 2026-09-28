import type { ToolCallRequest, ToolCallResult } from "../ai.types.js";
import {
  handleCheckCancellationEligibility,
  handleGetOrderStatus,
  handleGetPaymentStatus,
  handleGetProductDetails,
  handleGetShippingStatus,
  handleGetUserOrders,
  handleSearchPoliciesAndFaqs,
  handleSearchProductReviews,
  handleSearchProducts,
  type ToolContext,
} from "./tool.handlers.js";

/**
 * Executes a function call requested by Gemini or the intent router.
 * Dispatches safely with context (authenticated userId, matched items accumulator).
 */
export const executeToolCall = async (
  toolCall: ToolCallRequest,
  context: ToolContext,
): Promise<ToolCallResult> => {
  const { name, args } = toolCall;

  try {
    let result: any = null;

    switch (name) {
      case "searchProducts":
        result = await handleSearchProducts(args, context);
        break;
      case "getProductDetails":
        result = await handleGetProductDetails(args, context);
        break;
      case "getUserOrders":
        result = await handleGetUserOrders(args, context);
        break;
      case "getOrderStatus":
        result = await handleGetOrderStatus(args, context);
        break;
      case "getPaymentStatus":
        result = await handleGetPaymentStatus(args, context);
        break;
      case "checkCancellationEligibility":
        result = await handleCheckCancellationEligibility(args, context);
        break;
      case "getShippingStatus":
        result = await handleGetShippingStatus(args, context);
        break;
      case "searchPoliciesAndFaqs":
        result = await handleSearchPoliciesAndFaqs(args as any);
        break;
      case "searchProductReviews":
        result = await handleSearchProductReviews(args as any);
        break;
      default:
        return {
          name,
          result: null,
          error: `Unknown function name: "${name}"`,
        };
    }

    return {
      name,
      result,
    };
  } catch (error: any) {
    console.error(`[ERROR] Tool execution error for ${name}:`, error);
    return {
      name,
      result: null,
      error: error?.message || "Tool execution failed",
    };
  }
};
