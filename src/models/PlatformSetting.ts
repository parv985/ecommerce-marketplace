import { Schema, model, type Types } from "mongoose";

export interface IPlatformSetting {
  _id: Types.ObjectId;
  key: string;
  /* Numeric value (e.g. commission percentage 0-100). */
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

const platformSettingSchema =
  new Schema<IPlatformSetting>(
    {
      key: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      value: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    {
      timestamps: true,
    },
  );

export const PlatformSetting =
  model<IPlatformSetting>(
    "PlatformSetting",
    platformSettingSchema,
  );
