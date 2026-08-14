import { z } from "zod";

import { OrderStatus } from "../../constants/orderStatus.js";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

export const createOrderSchema = z
  .object({
    shippingAddressId: objectId,
  })
  .strict();

export const updateOrderStatusSchema = z
  .object({
    status: z.nativeEnum(OrderStatus),
  })
  .strict();

export const orderIdParamsSchema = z
  .object({
    id: objectId,
  })
  .strict();

export const listOrdersQuerySchema = z
  .object({
    status: z.nativeEnum(OrderStatus).optional(),

    page: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20),
  })
  .strict();

export type CreateOrderInput =
  z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput =
  z.infer<typeof updateOrderStatusSchema>;
export type ListOrdersQuery =
  z.infer<typeof listOrdersQuerySchema>;
