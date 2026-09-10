import type {
  Request,
  Response,
} from "express";

import { sendSuccess, sendError } from "../../utils/apiResponse.js";

import {
  deleteSellerDocument,
  getSellerProfile,
  registerSeller,
  updateSellerProfile,
  uploadSellerDocument,
} from "./seller.service.js";
import { countApprovedSellers } from "./seller.repository.js";


export const registerSellerController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {

    const result =
      await registerSeller(
        req.body,
      );

    sendSuccess(
      res,
      "Seller registration submitted successfully",
      result,
      201,
    );
  };

export const getSellerProfileController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {

    const profile =
      await getSellerProfile(
        req.user!.id,
      );

    sendSuccess(
      res,
      "Seller profile fetched successfully",
      profile,
    );
  };

export const updateSellerProfileController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {

    const profile =
      await updateSellerProfile(
        req.user!.id,
        req.body,
      );

    sendSuccess(
      res,
      "Seller profile updated successfully",
      profile,
    );
  };

export const uploadSellerDocumentController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const file = req.file;
    const { documentType } = req.body;

    if (!file) {
      sendError(
        res,
        "No file provided. Make sure the Content-Type is multipart/form-data and the file field is named 'document'.",
        "NO_FILE_PROVIDED",
        400,
      );
      return;
    }

    if (!documentType) {
      sendError(
        res,
        "Document type is required",
        "DOCUMENT_TYPE_REQUIRED",
        400,
      );
      return;
    }

    const document =
      await uploadSellerDocument(
        req.user!.id,
        file.buffer,
        file.originalname,
        documentType,
      );

    sendSuccess(
      res,
      "Document uploaded successfully",
      document,
    );
  };

export const deleteSellerDocumentController =
  async (
    req: Request<{ documentId: string }>,
    res: Response,
  ): Promise<void> => {
    await deleteSellerDocument(
      req.user!.id,
      req.params.documentId,
    );

    sendSuccess(
      res,
      "Document deleted successfully",
      null,
    );
  };

/**
 * Public endpoint: returns the count of approved sellers.
 * No authentication required — used by the homepage to display
 * the live marketplace seller count.
 */
export const getSellerCountController =
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    const count = await countApprovedSellers();

    sendSuccess(
      res,
      "Seller count fetched",
      { count },
    );
  };

