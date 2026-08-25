import { logger } from "../config/logger.js";

import cloudinary from "../config/cloudinary.js";

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

/**
 * Upload a buffer to Cloudinary.
 *
 * @param buffer       - File content as a Buffer
 * @param folder       - Cloudinary folder (e.g. "products", "avatars", "seller-documents")
 * @param filename     - Optional public-id prefix; Cloudinary appends a unique suffix
 * @param resourceType - Cloudinary resource type. Use "image" for images,
 *                       "raw" for PDFs/documents, or "auto" to let Cloudinary detect.
 */
export const uploadBuffer = async (
  buffer: Buffer,
  folder: string,
  filename?: string,
  resourceType: "image" | "raw" | "auto" = "auto",
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    /*
     * IMPORTANT: When using the `folder` parameter, Cloudinary automatically
     * prepends the folder to public_id. Do NOT include the folder prefix in
     * public_id — doing so creates a double-path (folder/folder/file) and
     * causes an Invalid Signature error because the signed parameters
     * don't match what Cloudinary expects.
     *
     * Example:
     *   folder="seller-documents", filename="doc_abc_GST_123"
     *   → public_id="doc_abc_GST_123"
     *   → Cloudinary stores at: seller-documents/doc_abc_GST_123
     */
    const publicId = filename
      ? filename
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    logger.info(
      `[CLOUDINARY] Uploading to folder=${folder}, public_id=${publicId}, resource_type=${resourceType}`,
    );

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error || !result) {
          const normalizedError = {
            name: error?.name ?? "CloudinaryUploadError",
            message: error?.message ?? "Cloudinary upload failed without an error message",
            http_code: error?.http_code,
            code: error?.code,
            status: error?.status,
            error: error?.error && {
              message: error.error.message,
              http_code: error.error.http_code,
              details: error.error.details,
              resource_type: error.error.resource_type,
              folder: error.error.folder,
            },
            response: error?.response && {
              status: error.response.status,
              statusText: error.response.statusText,
              headers: error.response.headers && {
                "content-type": error.response.headers["content-type"],
                "x-cld-error": error.response.headers["x-cld-error"],
              },
              data: error.response.data,
            },
          };

          logger.error(
            `Cloudinary upload failed for ${folder}/${filename ?? "unknown"}: ${normalizedError.message}`,
            normalizedError,
          );

          return reject(
            error ??
              new Error(normalizedError.message),
          );
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      },
    );

    stream.end(buffer);
  });
};

/**
 * Delete a file from Cloudinary by its public_id.
 * @param publicId  - The Cloudinary public_id of the resource
 * @param resourceType - The resource type ("image", "raw", "video"). Defaults to "image".
 * @returns true on success; false if the resource does not exist or an error occurs.
 */
export const deleteByPublicId = async (
  publicId: string,
  resourceType: "image" | "raw" | "video" = "image",
): Promise<boolean> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result.result === "ok";
  } catch (error) {
    logger.error(`Cloudinary delete failed for ${publicId}`, error);
    return false;
  }
};

/**
 * Verify Cloudinary configuration at startup.
 * Logs safe diagnostic info (no secrets exposed).
 */
export const verifyCloudinaryConfig = (): void => {
  const config = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    has_api_secret: Boolean(process.env.CLOUDINARY_API_SECRET),
    api_secret_length: process.env.CLOUDINARY_API_SECRET?.length ?? 0,
  };

  logger.info(
    `[CLOUDINARY] Configuration loaded: cloud_name=${config.cloud_name}, api_key=${config.api_key}, api_secret_present=${config.has_api_secret}, api_secret_length=${config.api_secret_length}`,
  );
};
