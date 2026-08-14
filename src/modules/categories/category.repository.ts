import {
  Category,
  type ICategory,
} from "../../models/Category.js";

export const findCategoryByName = async (
  name: string,
): Promise<ICategory | null> => {
  return Category.findOne({
    name: name.trim(),
  }).exec();
};

export const createCategory = async (
  data: Record<string, unknown>,
): Promise<ICategory> => {
  return Category.create(data);
};

export const findCategoryById = async (
  id: string,
): Promise<ICategory | null> => {
  return Category.findById(id).exec();
};

export const listActiveCategories = async (): Promise<ICategory[]> => {
  return Category.find({ isActive: true })
    .sort({ name: 1 })
    .exec();
};

export const listAllCategories = async (): Promise<ICategory[]> => {
  return Category.find()
    .sort({ name: 1 })
    .exec();
};

export const updateCategoryById = async (
  id: string,
  data: Record<string, unknown>,
): Promise<ICategory | null> => {
  return Category.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
    },
  ).exec();
};
