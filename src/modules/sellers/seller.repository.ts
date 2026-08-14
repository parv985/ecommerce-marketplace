import {
  User,
  type UserDocument,
} from "../../models/User.js";

import {
  Seller,
  type ISeller,
} from "../../models/Seller.js";

import { UserRole } from "../../constants/roles.js";


export const findUserByEmail = async (
  email: string,
): Promise<UserDocument | null> => {
  return User.findOne({
    email: email.toLowerCase(),
  }).exec();
};


export const findSellerByGstin = async (
  gstin: string,
): Promise<ISeller | null> => {
  return Seller.findOne({
    gstin: gstin.toUpperCase(),
  }).exec();
};

export const findSellerByUserId = async (
  userId: string,
): Promise<ISeller | null> => {
  return Seller.findOne({
    userId,
  }).exec();
};


export const findSellerByPan = async (
  pan: string,
): Promise<ISeller | null> => {
  return Seller.findOne({
    pan: pan.toUpperCase(),
  }).exec();
};


export const createSellerUser = async (
  data: {
    name: string;
    email: string;
    passwordHash: string;
  },
): Promise<UserDocument> => {
  return User.create({
    name: data.name,
    email: data.email.toLowerCase(),
    passwordHash: data.passwordHash,
    role: UserRole.SELLER,
    isEmailVerified: false,
    isActive: true,
  });
};


export const createSellerProfile = async (
  data: Omit<
    ISeller,
    "_id" | "createdAt" | "updatedAt"
  >,
): Promise<ISeller> => {
  return Seller.create(data);
};


export const deleteUserById = async (
  userId: string,
): Promise<void> => {
  await User.findByIdAndDelete(
    userId,
  ).exec();
};

export const updateSellerProfileById = async (
  sellerId: string,
  data: Record<string, unknown>,
): Promise<ISeller | null> => {
  return Seller.findByIdAndUpdate(
    sellerId,
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};