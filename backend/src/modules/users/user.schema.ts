import { z } from "zod";

const objectId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ObjectId",
  );

export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must not exceed 100 characters")
      .optional(),
  })
  .strict();

export const createAddressSchema = z
  .object({
    label: z
      .string()
      .trim()
      .max(30, "Label cannot exceed 30 characters")
      .optional()
      .default("Home"),

    recipientName: z
      .string()
      .trim()
      .min(2, "Recipient name must be at least 2 characters")
      .max(100, "Recipient name cannot exceed 100 characters"),

    phone: z
      .string()
      .trim()
      .regex(
        /^[0-9]{10}$/,
        "Invalid phone number",
      ),

    addressLine1: z
      .string()
      .trim()
      .min(3, "Address line 1 is required")
      .max(200, "Address line 1 is too long"),

    addressLine2: z
      .string()
      .trim()
      .max(200, "Address line 2 is too long")
      .optional(),

    city: z
      .string()
      .trim()
      .min(2, "City is required")
      .max(100, "City is too long"),

    state: z
      .string()
      .trim()
      .min(2, "State is required")
      .max(100, "State is too long"),

    pincode: z
      .string()
      .trim()
      .regex(
        /^[1-9][0-9]{5}$/,
        "Invalid Indian pincode",
      ),
  })
  .strict();

export const updateAddressSchema = z
  .object({
    label: z
      .string()
      .trim()
      .max(30, "Label cannot exceed 30 characters")
      .optional(),

    recipientName: z
      .string()
      .trim()
      .min(2, "Recipient name must be at least 2 characters")
      .max(100, "Recipient name cannot exceed 100 characters")
      .optional(),

    phone: z
      .string()
      .trim()
      .regex(
        /^[0-9]{10}$/,
        "Invalid phone number",
      )
      .optional(),

    addressLine1: z
      .string()
      .trim()
      .min(3, "Address line 1 is required")
      .max(200, "Address line 1 is too long")
      .optional(),

    addressLine2: z
      .string()
      .trim()
      .max(200, "Address line 2 is too long")
      .nullable()
      .optional(),

    city: z
      .string()
      .trim()
      .min(2, "City is required")
      .max(100, "City is too long")
      .optional(),

    state: z
      .string()
      .trim()
      .min(2, "State is required")
      .max(100, "State is too long")
      .optional(),

    pincode: z
      .string()
      .trim()
      .regex(
        /^[1-9][0-9]{5}$/,
        "Invalid Indian pincode",
      )
      .optional(),
  })
  .strict();

export const addressIdParamsSchema = z
  .object({
    id: objectId,
  })
  .strict();

export type UpdateProfileInput =
  z.infer<typeof updateProfileSchema>;
export type CreateAddressInput =
  z.infer<typeof createAddressSchema>;
export type UpdateAddressInput =
  z.infer<typeof updateAddressSchema>;
