import type {
  Request,
  Response,
} from "express";

import { sendSuccess } from "../../utils/apiResponse.js";

import {
  createNewCategory,
  deactivateCategory,
  getAllCategories,
  getActiveCategories,
  updateCategory,
} from "./category.service.js";

export const listCategoriesController =
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    const categories =
      await getActiveCategories();

    sendSuccess(
      res,
      "Categories fetched successfully",
      categories,
    );
  };

export const listAllCategoriesController =
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    const categories =
      await getAllCategories();

    sendSuccess(
      res,
      "Categories fetched successfully",
      categories,
    );
  };

export const createCategoryController =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const category =
      await createNewCategory(req.body);

    sendSuccess(
      res,
      "Category created successfully",
      category,
      201,
    );
  };

export const updateCategoryController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    const category =
      await updateCategory(
        req.params.id,
        req.body,
      );

    sendSuccess(
      res,
      "Category updated successfully",
      category,
    );
  };

export const deleteCategoryController =
  async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
    await deactivateCategory(
      req.params.id,
    );

    sendSuccess(
      res,
      "Category deactivated successfully",
      null,
    );
  };
