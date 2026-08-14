import { AppError } from "../../errors/AppError.js";
import type { ICategory } from "../../models/Category.js";
import {
  createCategory,
  findCategoryById,
  findCategoryByName,
  listActiveCategories,
  listAllCategories,
  updateCategoryById,
} from "./category.repository.js";
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "./category.schema.js";
import type { CategoryResponse } from "./category.types.js";

const toCategoryResponse = (
  category: ICategory,
): CategoryResponse => {
  return {
    id: category._id.toString(),
    name: category.name,
    description:
      category.description ?? null,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
};

export const getActiveCategories =
  async (): Promise<CategoryResponse[]> => {
    const categories =
      await listActiveCategories();

    return categories.map(
      toCategoryResponse,
    );
  };

export const getAllCategories =
  async (): Promise<CategoryResponse[]> => {
    const categories =
      await listAllCategories();

    return categories.map(
      toCategoryResponse,
    );
  };

export const createNewCategory = async (
  input: unknown,
): Promise<CategoryResponse> => {
  const data: CreateCategoryInput =
    createCategorySchema.parse(input);

  const existing = await findCategoryByName(
    data.name,
  );

  if (existing) {
    throw new AppError(
      "A category with this name already exists",
      409,
      "CATEGORY_EXISTS",
    );
  }

  const category = await createCategory({
    name: data.name,
    description: data.description,
    isActive: true,
  });

  return toCategoryResponse(category);
};

export const updateCategory = async (
  categoryId: string,
  input: unknown,
): Promise<CategoryResponse> => {
  const data: UpdateCategoryInput =
    updateCategorySchema.parse(input);

  const category = await findCategoryById(
    categoryId,
  );

  if (!category) {
    throw new AppError(
      "Category not found",
      404,
      "CATEGORY_NOT_FOUND",
    );
  }

  if (data.name && data.name !== category.name) {
    const existing = await findCategoryByName(
      data.name,
    );

    if (existing) {
      throw new AppError(
        "A category with this name already exists",
        409,
        "CATEGORY_EXISTS",
      );
    }
  }

  const updated = await updateCategoryById(
    categoryId,
    data,
  );

  if (!updated) {
    throw new AppError(
      "Category not found",
      404,
      "CATEGORY_NOT_FOUND",
    );
  }

  return toCategoryResponse(updated);
};

/*
 * Soft deactivate: isActive is flipped to false so existing
 * products keep their category reference intact.
 */
export const deactivateCategory = async (
  categoryId: string,
): Promise<void> => {
  const category = await findCategoryById(
    categoryId,
  );

  if (!category) {
    throw new AppError(
      "Category not found",
      404,
      "CATEGORY_NOT_FOUND",
    );
  }

  await updateCategoryById(categoryId, {
    isActive: false,
  });
};
