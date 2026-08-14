import { z } from "zod";

export const sellerRegistrationSchema =
  z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name cannot exceed 100 characters"),

    email: z
      .string()
      .trim()
      .email("Invalid email address")
      .transform((value) =>
        value.toLowerCase(),
      ),

    password: z
      .string()
      .min(
        8,
        "Password must be at least 8 characters",
      )
      .max(
        100,
        "Password cannot exceed 100 characters",
      ),

    businessName: z
      .string()
      .trim()
      .min(
        2,
        "Business name must be at least 2 characters",
      )
      .max(
        150,
        "Business name cannot exceed 150 characters",
      ),

    phone: z
      .string()
      .trim()
      .regex(
        /^[0-9]{10}$/,
        "Invalid phone number",
      )
      .optional(),

    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
        "Invalid GSTIN format",
      ),

    pan: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z]{5}[0-9]{4}[A-Z]$/,
        "Invalid PAN format",
      ),

    bankAccountHolderName: z
      .string()
      .trim()
      .min(
        2,
        "Bank account holder name is required",
      ),

    bankAccountNumber: z
      .string()
      .trim()
      .min(
        8,
        "Invalid bank account number",
      )
      .max(
        20,
        "Invalid bank account number",
      ),

    ifscCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z]{4}0[A-Z0-9]{6}$/,
        "Invalid IFSC code",
      ),

    addressLine1: z
      .string()
      .trim()
      .min(
        3,
        "Address is required",
      ),

    addressLine2: z
      .string()
      .trim()
      .optional(),

    city: z
      .string()
      .trim()
      .min(2, "City is required"),

    state: z
      .string()
      .trim()
      .min(2, "State is required"),

    pincode: z
      .string()
      .trim()
      .regex(
        /^[1-9][0-9]{5}$/,
        "Invalid Indian pincode",
      ),

    documents: z
      .array(
        z.object({
          type: z
            .string()
            .trim()
            .min(1),

          url: z
            .string()
            .trim()
            .url(),
        }),
      )
      .optional()
      .default([]),
  });

export type SellerRegistrationSchemaInput =
  z.infer<
    typeof sellerRegistrationSchema
  >;

/*
 * Self-service profile updates.
 *
 * GSTIN / PAN are identity documents and cannot be changed
 * after registration, so they are intentionally not part of
 * this schema (.strict() rejects them instead of ignoring).
 */
export const updateSellerProfileSchema =
  z
    .object({
      businessName: z
        .string()
        .trim()
        .min(2, "Business name must be at least 2 characters")
        .max(150, "Business name cannot exceed 150 characters")
        .optional(),

      phone: z
        .string()
        .trim()
        .regex(
          /^[0-9]{10}$/,
          "Invalid phone number",
        )
        .optional(),

      bankAccountHolderName: z
        .string()
        .trim()
        .min(2, "Bank account holder name is required")
        .optional(),

      bankAccountNumber: z
        .string()
        .trim()
        .min(8, "Invalid bank account number")
        .max(20, "Invalid bank account number")
        .optional(),

      ifscCode: z
        .string()
        .trim()
        .toUpperCase()
        .regex(
          /^[A-Z]{4}0[A-Z0-9]{6}$/,
          "Invalid IFSC code",
        )
        .optional(),

      addressLine1: z
        .string()
        .trim()
        .min(3, "Address is required")
        .optional(),

      addressLine2: z
        .string()
        .trim()
        .optional(),

      city: z
        .string()
        .trim()
        .min(2, "City is required")
        .optional(),

      state: z
        .string()
        .trim()
        .min(2, "State is required")
        .optional(),

      pincode: z
        .string()
        .trim()
        .regex(
          /^[1-9][0-9]{5}$/,
          "Invalid Indian pincode",
        )
        .optional(),

      documents: z
        .array(
          z.object({
            type: z
              .string()
              .trim()
              .min(1),

            url: z
              .string()
              .trim()
              .url(),
          }),
        )
        .optional(),
    })
    .strict();

export type UpdateSellerProfileSchemaInput =
  z.infer<
    typeof updateSellerProfileSchema
  >;
  