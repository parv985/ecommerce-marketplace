import {
  User,
  type UserDocument,
} from "../../models/User.js";
import {
  Address,
  type IAddress,
} from "../../models/Address.js";

export const findUserById = async (
  userId: string,
): Promise<UserDocument | null> => {
  // `avatarPublicId` is `select: false` in the User schema, so it must be
  // explicitly selected — avatar upload/delete rely on it to remove the
  // previous Cloudinary image. Without this, deletes always fail with
  // "No avatar to delete" and old Cloudinary images are never cleaned up.
  return User.findById(userId).select("+avatarPublicId").exec();
};

export const updateUserById = async (
  userId: string,
  data: Record<string, unknown>,
): Promise<UserDocument | null> => {
  return User.findByIdAndUpdate(
    userId,
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};

export const createAddress = async (
  data: Record<string, unknown>,
): Promise<IAddress> => {
  return Address.create(data);
};

export const findAddressByIdAndUser = async (
  id: string,
  userId: string,
): Promise<IAddress | null> => {
  return Address.findOne({
    _id: id,
    userId,
  }).exec();
};

export const listAddressesByUser = async (
  userId: string,
): Promise<IAddress[]> => {
  return Address.find({ userId })
    .sort({ createdAt: -1 })
    .exec();
};

export const updateAddressByIdAndUser = async (
  id: string,
  userId: string,
  data: Record<string, unknown>,
): Promise<IAddress | null> => {
  return Address.findOneAndUpdate(
    {
      _id: id,
      userId,
    },
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};

export const deleteAddressByIdAndUser = async (
  id: string,
  userId: string,
): Promise<IAddress | null> => {
  return Address.findOneAndDelete({
    _id: id,
    userId,
  }).exec();
};
