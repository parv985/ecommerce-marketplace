import multer from "multer";

import { AppError } from "../errors/AppError.js";

const storage = multer.memoryStorage();

const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const ALLOWED_DOCUMENT_MIMES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Multer upload for product / avatar images.
 * Accepts a single file on the "image" field.
 */
export const uploadImage = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          "Only JPEG, PNG, WebP and GIF images are allowed",
          400,
          "INVALID_FILE_TYPE",
        ),
      );
    }
  },
});

/**
 * Multer upload for product images (up to 8).
 * Accepts multiple files on the "images" field.
 */
export const uploadProductImages = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          "Only JPEG, PNG, WebP and GIF images are allowed",
          400,
          "INVALID_FILE_TYPE",
        ),
      );
    }
  },
});

/**
 * Multer upload for seller KYC documents.
 * Accepts a single file on the "document" field.
 */
export const uploadDocument = multer({
  storage,
  limits: { fileSize: MAX_DOCUMENT_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOCUMENT_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          "Only JPEG, PNG and PDF documents are allowed",
          400,
          "INVALID_FILE_TYPE",
        ),
      );
    }
  },
});
