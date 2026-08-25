  import {
    Schema,
    model,
    type Types,
  } from "mongoose";

  import { SellerStatus } from "../constants/sellerStatus.js";

  export interface ISeller {
    _id: Types.ObjectId;

    userId: Types.ObjectId;

    businessName: string;

    phone?: string;

    gstin: string;

    pan: string;

    bankAccountHolderName: string;

    bankAccountNumber: string;

    ifscCode: string;

    addressLine1: string;

    addressLine2?: string;

    city: string;

    state: string;

    pincode: string;

    documents: {
      type: string;
      url: string;
      publicId: string;
    }[];

    status: SellerStatus;

    statusReason?: string | null;

    createdAt: Date;

    updatedAt: Date;
  }

  const sellerSchema = new Schema<ISeller>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
      },

      businessName: {
        type: String,
        required: true,
        trim: true,
      },

      phone: {
        type: String,
        trim: true,
      },

      gstin: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        unique: true,
        index: true,
      },

      pan: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        unique: true,
        index: true,
      },

      bankAccountHolderName: {
        type: String,
        required: true,
        trim: true,
      },

      bankAccountNumber: {
        type: String,
        required: true,
        trim: true,
      },

      ifscCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
      },

      addressLine1: {
        type: String,
        required: true,
        trim: true,
      },

      addressLine2: {
        type: String,
        trim: true,
      },

      city: {
        type: String,
        required: true,
        trim: true,
      },

      state: {
        type: String,
        required: true,
        trim: true,
      },

      pincode: {
        type: String,
        required: true,
        trim: true,
      },

      documents: [
        {
          type: {
            type: String,
            required: true,
            trim: true,
          },

          url: {
            type: String,
            required: true,
            trim: true,
          },

          publicId: {
            type: String,
            required: true,
            trim: true,
          },
        },
      ],

      status: {
        type: String,
        enum: Object.values(SellerStatus),
        default: SellerStatus.PENDING,
        index: true,
      },

      statusReason: {
        type: String,
        default: null,
        trim: true,
      },
    },
    {
      timestamps: true,
    },
  );

  export const Seller = model<ISeller>(
    "Seller",
    sellerSchema,
  );