import type {
  Request,
  Response,
} from "express";

import { sendSuccess } from "../../utils/apiResponse.js";

import {
  browseProducts,
  createProductForSeller,
  deleteProductImage,
  deleteSellerProduct,
  getProductDetails,
  getPublicProductDetails,
  listSellerProducts,
  updateSellerProduct,
  uploadProductImages,
} from "./product.service.js";

export const createProductController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const product =
      await createProductForSeller(
        req.user!.id,
        req.body,
      );

    sendSuccess(
      res,
      "Product created successfully",
      product,
      201,
    );
  };

export const listMyProductsController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const products =
      await listSellerProducts(
        req.user!.id,
      );

    sendSuccess(
      res,
      "Products fetched successfully",
      products,
    );
  };

export const getSellerProductController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const product =
      await getProductDetails(
        req.params.id,
        req.user!.id,
      );

    sendSuccess(
      res,
      "Product fetched successfully",
      product,
    );
  };

export const getPublicProductController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const product =
      await getPublicProductDetails(
        req.params.id,
      );

    sendSuccess(
      res,
      "Product fetched successfully",
      product,
    );
  };

export const updateProductController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const product =
      await updateSellerProduct(
        req.user!.id,
        req.params.id,
        req.body,
      );

    sendSuccess(
      res,
      "Product updated successfully",
      product,
    );
  };

export const deleteProductController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    await deleteSellerProduct(
      req.user!.id,
      req.params.id,
    );

    sendSuccess(
      res,
      "Product deactivated successfully",
      null,
    );
  };

export const browseProductsController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const result =
      await browseProducts(req.query);

    sendSuccess(
      res,
      "Products fetched successfully",
      result,
    );
  };

export const uploadProductImagesController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      sendSuccess(
        res,
        "No files provided",
        null,
        400,
      );
      return;
    }

    const images =
      await uploadProductImages(
        req.user!.id,
        req.params.id,
        files.map((f) => ({
          buffer: f.buffer,
          originalname: f.originalname,
        })),
      );

    sendSuccess(
      res,
      "Product images uploaded successfully",
      images,
    );
  };

export const deleteProductImageController =
  async (
    req: Request<{ id: string; imageId: string }>,
    res: Response,
  ): Promise<void> => {
    await deleteProductImage(
      req.user!.id,
      req.params.id,
      req.params.imageId,
    );

    sendSuccess(
      res,
      "Product image deleted successfully",
      null,
    );
  };

