import { ProductStatus } from "../../constants/productStatus.js";
import { SellerStatus } from "../../constants/sellerStatus.js";
import { AppError } from "../../errors/AppError.js";
import type { IProduct } from "../../models/Product.js";
import { findSellerByUserId } from "../sellers/seller.repository.js";
import {
  createProduct,
  findActiveCategoryById,
  findCategoryNames,
  findProductById,
  findProductByIdAndSeller,
  findProductsBySeller,
  listProducts,
  updateProductById,
} from "./product.repository.js";
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
  type CreateProductInput,
  type ListProductsQuery,
  type UpdateProductInput,
} from "./product.schema.js";
import type {
  PaginatedProducts,
  ProductResponse,
} from "./product.types.js";

const validateCategory = async (
  category?: string | null,
): Promise<void> => {
  if (category) {
    const exists = await findActiveCategoryById(
      category,
    );

    if (!exists) {
      throw new AppError(
        "Category does not exist or is inactive",
        400,
        "INVALID_CATEGORY",
      );
    }
  }
};

const toProductResponse = async (
  product: IProduct,
): Promise<ProductResponse> => {
  let categoryName: string | null = null;

  if (product.category) {
    const names = await findCategoryNames([
      product.category.toString(),
    ]);

    categoryName =
      names.get(product.category.toString()) ??
      null;
  }

  return {
    id: product._id.toString(),
    sellerId: product.sellerId.toString(),
    name: product.name,
    description: product.description ?? null,
    category: product.category
      ? {
          id: product.category.toString(),
          name: categoryName,
        }
      : null,
    price: product.price,
    stock: product.stock,
    images: product.images ?? [],
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

export const createProductForSeller = async (
  sellerId: string,
  input: unknown,
): Promise<ProductResponse> => {
  const data: CreateProductInput =
    createProductSchema.parse(input);

  /*
   * Only approved sellers may list products. Enforced here so a
   * pending/rejected/suspended seller cannot create listings.
   */
  const seller = await findSellerByUserId(
    sellerId,
  );

  if (!seller || seller.status !== SellerStatus.APPROVED) {
    throw new AppError(
      "Your seller account must be approved before you can list products",
      403,
      "SELLER_NOT_APPROVED",
    );
  }

  await validateCategory(data.category);

  const product = await createProduct({
    sellerId,
    name: data.name,
    description: data.description,
    category: data.category ?? null,
    price: data.price,
    stock: data.stock,
    images: data.images,
    status: data.status,
  });

  return toProductResponse(product);
};

export const listSellerProducts = async (
  sellerId: string,
): Promise<ProductResponse[]> => {
  const products = await findProductsBySeller(
    sellerId,
  );

  return Promise.all(
    products.map(toProductResponse),
  );
};

/*
 * Ownership-scoped single-product lookup used by sellers:
 * when sellerId is provided the product is fetched with an
 * ownership filter, so a seller can never read another
 * seller's product (including drafts).
 */
export const getProductDetails = async (
  productId: string,
  sellerId?: string,
): Promise<ProductResponse> => {
  const product = sellerId
    ? await findProductByIdAndSeller(
        productId,
        sellerId,
      )
    : await findProductById(productId);

  if (!product) {
    throw new AppError(
      "Product not found",
      404,
      "PRODUCT_NOT_FOUND",
    );
  }

  return toProductResponse(product);
};

export const getPublicProductDetails =
  async (
    productId: string,
  ): Promise<ProductResponse> => {
    const product = await findProductById(
      productId,
    );

    if (
      !product ||
      product.status !==
        ProductStatus.ACTIVE
    ) {
      throw new AppError(
        "Product not found",
        404,
        "PRODUCT_NOT_FOUND",
      );
    }

    return toProductResponse(product);
  };

export const updateSellerProduct = async (
  sellerId: string,
  productId: string,
  input: unknown,
): Promise<ProductResponse> => {
  const data: UpdateProductInput =
    updateProductSchema.parse(input);

  const product = await findProductByIdAndSeller(
    productId,
    sellerId,
  );

  if (!product) {
    throw new AppError(
      "Product not found",
      404,
      "PRODUCT_NOT_FOUND",
    );
  }

  await validateCategory(data.category);

  const updated = await updateProductById(
    productId,
    data,
  );

  if (!updated) {
    throw new AppError(
      "Product not found",
      404,
      "PRODUCT_NOT_FOUND",
    );
  }

  return toProductResponse(updated);
};

/*
 * Soft delete: sets the product INACTIVE so it disappears
 * from the public catalog while order history stays intact.
 */
export const deleteSellerProduct = async (
  sellerId: string,
  productId: string,
): Promise<void> => {
  const product = await findProductByIdAndSeller(
    productId,
    sellerId,
  );

  if (!product) {
    throw new AppError(
      "Product not found",
      404,
      "PRODUCT_NOT_FOUND",
    );
  }

  await updateProductById(productId, {
    status: ProductStatus.INACTIVE,
  });
};

export const browseProducts = async (
  query: unknown,
): Promise<PaginatedProducts> => {
  const parsed: ListProductsQuery =
    listProductsQuerySchema.parse(query);

  const filter: Record<string, unknown> = {
    status: ProductStatus.ACTIVE,
  };

  if (parsed.search) {
    const escaped = parsed.search.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

    filter.$or = [
      {
        name: {
          $regex: escaped,
          $options: "i",
        },
      },
      {
        description: {
          $regex: escaped,
          $options: "i",
        },
      },
    ];
  }

  if (parsed.category) {
    filter.category = parsed.category;
  }

  if (
    parsed.minPrice !== undefined ||
    parsed.maxPrice !== undefined
  ) {
    const priceFilter: Record<
      string,
      number
    > = {};

    if (parsed.minPrice !== undefined) {
      priceFilter.$gte = parsed.minPrice;
    }

    if (parsed.maxPrice !== undefined) {
      priceFilter.$lte = parsed.maxPrice;
    }

    filter.price = priceFilter;
  }

  const sortMap: Record<
    string,
    Record<string, 1 | -1>
  > = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    name_asc: { name: 1 },
  };

  const sort =
    sortMap[parsed.sort ?? "newest"] ??
    { createdAt: -1 };

  const { items, total } = await listProducts(
    filter,
    sort,
    parsed.page,
    parsed.limit,
  );

  const categoryIds = Array.from(
    new Set(
      items
        .map((item) =>
          item.category
            ? item.category.toString()
            : null,
        )
        .filter(
          (id): id is string =>
            id !== null,
        ),
    ),
  );

  const names = await findCategoryNames(
    categoryIds,
  );

  const productResponses = items.map(
    (item): ProductResponse => {
      return {
        id: item._id.toString(),
        sellerId:
          item.sellerId.toString(),
        name: item.name,
        description:
          item.description ?? null,
        category: item.category
          ? {
              id: item.category.toString(),
              name:
                names.get(
                  item.category.toString(),
                ) ?? null,
            }
          : null,
        price: item.price,
        stock: item.stock,
        images: item.images ?? [],
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    },
  );

  return {
    items: productResponses,
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) ||
      0,
  };
};
