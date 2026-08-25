import type {
  Request,
  Response,
} from "express";

import { sendSuccess } from "../../utils/apiResponse.js";

import {
  addUserAddress,
  deleteUserAddress,
  getCurrentUserProfile,
  getUserAddresses,
  updateCurrentUserProfile,
  updateUserAddress,
  uploadUserAvatar,
  deleteUserAvatar,
} from "./user.service.js";

export const getMyProfileController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const profile =
      await getCurrentUserProfile(
        req.user!.id,
      );

    sendSuccess(
      res,
      "Profile fetched successfully",
      profile,
    );
  };

export const updateMyProfileController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const profile =
      await updateCurrentUserProfile(
        req.user!.id,
        req.body,
      );

    sendSuccess(
      res,
      "Profile updated successfully",
      profile,
    );
  };

export const listMyAddressesController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const addresses =
      await getUserAddresses(
        req.user!.id,
      );

    sendSuccess(
      res,
      "Addresses fetched successfully",
      addresses,
    );
  };

export const createMyAddressController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const address =
      await addUserAddress(
        req.user!.id,
        req.body,
      );

    sendSuccess(
      res,
      "Address created successfully",
      address,
      201,
    );
  };

export const updateMyAddressController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const address =
      await updateUserAddress(
        req.user!.id,
        req.params.id,
        req.body,
      );

    sendSuccess(
      res,
      "Address updated successfully",
      address,
    );
  };

export const deleteMyAddressController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    await deleteUserAddress(
      req.user!.id,
      req.params.id,
    );

    sendSuccess(
      res,
      "Address deleted successfully",
      null,
    );
  };

export const uploadAvatarController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const file = req.file;

    if (!file) {
      sendSuccess(
        res,
        "No file provided",
        null,
        400,
      );
      return;
    }

    const avatar =
      await uploadUserAvatar(
        req.user!.id,
        file.buffer,
        file.originalname,
      );

    sendSuccess(
      res,
      "Avatar uploaded successfully",
      avatar,
    );
  };

export const deleteAvatarController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    await deleteUserAvatar(
      req.user!.id,
    );

    sendSuccess(
      res,
      "Avatar deleted successfully",
      null,
    );
  };

