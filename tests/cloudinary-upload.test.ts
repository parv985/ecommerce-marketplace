import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerErrorMock, uploadStreamMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  uploadStreamMock: vi.fn(),
}));

vi.mock("../src/config/logger.js", () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

vi.mock("../src/config/cloudinary.js", () => ({
  default: {
    uploader: {
      upload_stream: uploadStreamMock,
      destroy: vi.fn(),
    },
  },
}));

import { uploadBuffer } from "../src/services/cloudinary.service.js";

describe("uploadBuffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs the full Cloudinary 403 details without exposing secrets", async () => {
    uploadStreamMock.mockImplementation((_options, callback) => {
      callback(
        {
          name: "UnexpectedResponse",
          message: "Server returned unexpected status code - 403",
          http_code: 403,
          code: "UnexpectedResponse",
          status: 403,
          error: {
            message: "Forbidden",
            http_code: 403,
            details: "API key is restricted",
          },
          response: {
            status: 403,
            statusText: "Forbidden",
            headers: {
              "content-type": "application/json",
              "x-cld-error": "Forbidden",
            },
            data: {
              error: {
                message: "API key is restricted from uploading raw documents",
                resource_type: "raw",
              },
            },
          },
        },
        null,
      );

      return { end: vi.fn() };
    });

    await expect(
      uploadBuffer(Buffer.from("%PDF-1.4"), "seller-documents", "doc_1", "raw"),
    ).rejects.toThrow("Server returned unexpected status code - 403");

    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("seller-documents/doc_1"),
      expect.objectContaining({
        name: "UnexpectedResponse",
        message: "Server returned unexpected status code - 403",
        http_code: 403,
        status: 403,
        response: expect.objectContaining({
          status: 403,
          data: expect.objectContaining({
            error: expect.objectContaining({
              message: "API key is restricted from uploading raw documents",
            }),
          }),
        }),
      }),
    );
  });
});
