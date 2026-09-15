import {
  Schema,
  model,
  type Types,
} from "mongoose";

import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../constants/orderStatus.js";

export interface IOrderItem {
  productId: Types.ObjectId;
  name: string;
  /* Original unit price (before any sales discount). */
  price: number;
  quantity: number;
  /* Original line total (price * quantity). */
  subtotal: number;
  /* Absolute sales-discount amount applied to this line. */
  discountAmount: number;
}

export interface IShippingAddress {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface IOrder {
  _id: Types.ObjectId;
  orderNumber: string;
  userId: Types.ObjectId;
  sellerId: Types.ObjectId;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  /* Sum of original line subtotals (before discounts). */
  itemsTotal: number;
  /* Sum of sales-discount amounts applied to the items. */
  discountTotal: number;
  /* Applied coupon, when the buyer used one at checkout. */
  couponId?: Types.ObjectId | null;
  couponCode?: string | null;
  /* Absolute discount contributed by the coupon. */
  couponDiscount: number;
  /* Final payable amount: itemsTotal - discountTotal - couponDiscount. */
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /* Payment record id once payment is initiated through the gateway. */
  paymentId?: Types.ObjectId | null;
  status: OrderStatus;
  /* Set when the order transitions to DELIVERED (return window anchor). */
  deliveredAt?: Date | null;
  /* Set when a return is approved and the order becomes RETURNED. */
  returnedAt?: Date | null;
  /* Return request that closed this order, when it went through a return. */
  returnRequestId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    _id: false,
  },
);

const shippingAddressSchema =
  new Schema<IShippingAddress>(
    {
      recipientName: {
        type: String,
        required: true,
        trim: true,
      },

      phone: {
        type: String,
        required: true,
        trim: true,
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
    },
    {
      _id: false,
    },
  );

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
    },

    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },

    itemsTotal: {
      type: Number,
      required: true,
      min: 0,
    },

    discountTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    couponId: {
      type: Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },

    couponCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    couponDiscount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.CASH_ON_DELIVERY,
    },

    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },

    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
      index: true,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    returnedAt: {
      type: Date,
      default: null,
    },

    returnRequestId: {
      type: Schema.Types.ObjectId,
      ref: "ReturnRequest",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });
orderSchema.index({ deliveredAt: 1, sellerId: 1 });

export const Order = model<IOrder>(
  "Order",
  orderSchema,
);
