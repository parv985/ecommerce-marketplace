import { ProductStatus } from "../../constants/productStatus.js";
import { SellerStatus } from "../../constants/sellerStatus.js";
import { AppError } from "../../errors/AppError.js";
import { UserRole } from "../../constants/roles.js";
import { logAudit } from "../../services/audit.service.js";
import { CACHE_TTL, getCacheKey, getFromCache, invalidateCache, setCache } from "../../config/redis.js";
import { deleteByPublicId, uploadBuffer } from "../../services/cloudinary.service.js";
import type { IProduct } from "../../models/Product.js";
import { resolveDiscountsForProducts } from "../discounts/discount.pricing.js";
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
  ProductActiveDiscount,
  ProductResponse,
} from "./product.types.js";

/*
 * Resolves the live seller discount currently applicable to each
 * product (product-specific discounts win over category discounts, the
 * highest percentage wins, discounts are never stacked - the exact
 * rules used at checkout). Returns a map keyed by product id; products
 * without a live discount are absent from the map.
 */
const resolveActiveDiscounts = async (
  products: IProduct[],
): Promise<Map<string, ProductActiveDiscount>> => {
  const appliedMap = await resolveDiscountsForProducts(
    products.map((product) => ({
      id: product._id.toString(),
      categoryId: product.category
        ? product.category.toString()
        : null,
      price: product.price,
    })),
  );

  const result = new Map<string, ProductActiveDiscount>();

  for (const applied of appliedMap.values()) {
    result.set(applied.productId, {
      id: applied.discountId,
      discountValue: applied.discountValue,
      discountAmount: applied.discountAmount,
      discountedPrice: applied.discountedPrice,
    });
  }

  return result;
};

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
    sku: product.sku ?? null,
    category: product.category
      ? {
          id: product.category.toString(),
          name: categoryName,
        }
      : null,
    price: product.price,
    stock: product.stock,
    images: product.images ?? [],
    specifications: product.specifications ?? [],
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

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "PRODUCT_CREATED",
    entityType: "PRODUCT",
    entityId: product._id.toString(),
    metadata: { name: product.name },
  });

  /* Invalidate product catalog cache */
  await invalidateCache(getCacheKey("products", "*"));

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

    const response = await toProductResponse(product);

    const activeDiscounts =
      await resolveActiveDiscounts([product]);

    response.activeDiscount =
      activeDiscounts.get(response.id) ??
      null;

    return response;
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

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "PRODUCT_UPDATED",
    entityType: "PRODUCT",
    entityId: productId,
  });

  /* Invalidate product catalog cache */
  await invalidateCache(getCacheKey("products", "*"));

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

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "PRODUCT_STATUS_CHANGED",
    entityType: "PRODUCT",
    entityId: productId,
    before: { status: product.status },
    after: { status: ProductStatus.INACTIVE },
  });

  /* Invalidate product catalog cache */
  await invalidateCache(getCacheKey("products", "*"));
};

export const browseProducts = async (
  query: unknown,
): Promise<PaginatedProducts> => {
  const parsed: ListProductsQuery =
    listProductsQuerySchema.parse(query);

  /*
   * Cache key includes all query parameters to ensure
   * different queries hit different cache entries.
   */
  const cacheKey = getCacheKey(
    "products",
    "browse",
    JSON.stringify(parsed),
  );

  const cached = await getFromCache<PaginatedProducts>(cacheKey);
  if (cached) return cached;

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

  const activeDiscounts =
    await resolveActiveDiscounts(items);

  const productResponses = items.map(
    (item): ProductResponse => {
      const id = item._id.toString();

      return {
        id,
        sellerId:
          item.sellerId.toString(),
        name: item.name,
        description:
          item.description ?? null,
        sku: item.sku ?? null,
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
        specifications: item.specifications ?? [],
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        activeDiscount:
          activeDiscounts.get(id) ??
          null,
      };
    },
  );

  const result: PaginatedProducts = {
    items: productResponses,
    page: parsed.page,
    limit: parsed.limit,
    total,
    totalPages:
      Math.ceil(total / parsed.limit) || 0,
  };

  /* Cache for 1 minute */
  await setCache(cacheKey, result, CACHE_TTL.PRODUCT_CATALOG);

  return result;
};

/**
 * Upload one or more images to a product owned by the seller.
 * Appends each uploaded image to the product's images array.
 */
export const uploadProductImages = async (
  sellerId: string,
  productId: string,
  files: { buffer: Buffer; originalname: string }[],
): Promise<{ url: string; publicId: string }[]> => {
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

  if (product.images.length + files.length > 8) {
    throw new AppError(
      "A product can have at most 8 images",
      400,
      "TOO_MANY_IMAGES",
    );
  }

  const uploaded: { url: string; publicId: string }[] = [];

  for (const file of files) {
    const filename = `product_${productId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const result = await uploadBuffer(file.buffer, "products", filename);
    uploaded.push(result);
  }

  const newImages = product.images.concat(uploaded);
  await updateProductById(productId, { images: newImages });

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "PRODUCT_IMAGES_UPLOADED",
    entityType: "PRODUCT",
    entityId: productId,
    metadata: { count: uploaded.length },
  });

  return uploaded;
};

/**
 * Delete a single image from a product owned by the seller.
 * Removes the Cloudinary asset and the DB record.
 */
export const deleteProductImage = async (
  sellerId: string,
  productId: string,
  imagePublicId: string,
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

  const imageIndex = product.images.findIndex(
    (img) => img.publicId === imagePublicId,
  );

  if (imageIndex === -1) {
    throw new AppError(
      "Image not found on this product",
      404,
      "IMAGE_NOT_FOUND",
    );
  }

  // Remove from Cloudinary (best-effort)
  await deleteByPublicId(imagePublicId);

  // Remove from the array
  const updatedImages = [...product.images];
  updatedImages.splice(imageIndex, 1);
  await updateProductById(productId, { images: updatedImages });

  await logAudit({
    actorId: sellerId,
    actorRole: UserRole.SELLER,
    action: "PRODUCT_IMAGE_DELETED",
    entityType: "PRODUCT",
    entityId: productId,
  });
};
