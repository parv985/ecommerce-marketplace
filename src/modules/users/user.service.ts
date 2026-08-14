import { AppError } from "../../errors/AppError.js";
import type { UserDocument } from "../../models/User.js";
import type { IAddress } from "../../models/Address.js";
import {
  createAddress,
  deleteAddressByIdAndUser,
  findAddressByIdAndUser,
  findUserById,
  listAddressesByUser,
  updateAddressByIdAndUser,
  updateUserById,
} from "./user.repository.js";
import {
  createAddressSchema,
  updateAddressSchema,
  updateProfileSchema,
  type CreateAddressInput,
  type UpdateAddressInput,
  type UpdateProfileInput,
} from "./user.schema.js";
import type {
  AddressResponse,
  UserProfileResponse,
} from "./user.types.js";

const toUserProfileResponse = (
  user: UserDocument,
): UserProfileResponse => {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar ?? null,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
  };
};

const toAddressResponse = (
  address: IAddress,
): AddressResponse => {
  return {
    id: address._id.toString(),
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? null,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
};

export const getCurrentUserProfile = async (
  userId: string,
): Promise<UserProfileResponse> => {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  return toUserProfileResponse(user);
};

export const updateCurrentUserProfile = async (
  userId: string,
  input: unknown,
): Promise<UserProfileResponse> => {
  const data: UpdateProfileInput =
    updateProfileSchema.parse(input);

  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  const updated = await updateUserById(
    userId,
    data,
  );

  if (!updated) {
    throw new AppError(
      "User not found",
      404,
      "USER_NOT_FOUND",
    );
  }

  return toUserProfileResponse(updated);
};

export const addUserAddress = async (
  userId: string,
  input: unknown,
): Promise<AddressResponse> => {
  const data: CreateAddressInput =
    createAddressSchema.parse(input);

  const address = await createAddress({
    userId,
    label: data.label,
    recipientName: data.recipientName,
    phone: data.phone,
    addressLine1: data.addressLine1,
    addressLine2: data.addressLine2,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
  });

  return toAddressResponse(address);
};

export const getUserAddresses = async (
  userId: string,
): Promise<AddressResponse[]> => {
  const addresses =
    await listAddressesByUser(userId);

  return addresses.map(toAddressResponse);
};

export const updateUserAddress = async (
  userId: string,
  addressId: string,
  input: unknown,
): Promise<AddressResponse> => {
  const data: UpdateAddressInput =
    updateAddressSchema.parse(input);

  const address =
    await findAddressByIdAndUser(
      addressId,
      userId,
    );

  if (!address) {
    throw new AppError(
      "Address not found",
      404,
      "ADDRESS_NOT_FOUND",
    );
  }

  const updated =
    await updateAddressByIdAndUser(
      addressId,
      userId,
      data,
    );

  if (!updated) {
    throw new AppError(
      "Address not found",
      404,
      "ADDRESS_NOT_FOUND",
    );
  }

  return toAddressResponse(updated);
};

export const deleteUserAddress = async (
  userId: string,
  addressId: string,
): Promise<void> => {
  const address =
    await findAddressByIdAndUser(
      addressId,
      userId,
    );

  if (!address) {
    throw new AppError(
      "Address not found",
      404,
      "ADDRESS_NOT_FOUND",
    );
  }

  await deleteAddressByIdAndUser(
    addressId,
    userId,
  );
};
