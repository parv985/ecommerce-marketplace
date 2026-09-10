import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerErrorMock, uploadStreamMock, destroyMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  uploadStreamMock: vi.fn(),
  destroyMock: vi.fn(),
}));

vi.mock("../src/config/logger.js", () => ({
  logger: {
    error: loggerErrorMock,
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../src/config/cloudinary.js", () => ({
  default: {
    uploader: {
      upload_stream: uploadStreamMock,
      destroy: destroyMock,
    },
  },
}));

import {
  deleteByPublicId,
  destroyByPublicId,
  uploadBuffer,
} from "../src/services/cloudinary.service.js";

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

describe("destroyByPublicId / deleteByPublicId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the resource type through and resolves 'ok' on success", async () => {
    destroyMock.mockResolvedValue({ result: "ok" });

    await expect(
      destroyByPublicId("seller-documents/doc_1.pdf", "raw"),
    ).resolves.toBe("ok");
    expect(destroyMock).toHaveBeenCalledWith("seller-documents/doc_1.pdf", {
      resource_type: "raw",
    });
  });

  it("resolves 'not found' when the asset is already gone", async () => {
    destroyMock.mockResolvedValue({ result: "not found" });

    await expect(destroyByPublicId("missing", "raw")).resolves.toBe("not found");
  });

  it("rejects (and logs) when the Cloudinary API fails", async () => {
    destroyMock.mockRejectedValue(new Error("Invalid Signature"));

    await expect(destroyByPublicId("doc", "raw")).rejects.toThrow("Invalid Signature");
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it("deleteByPublicId stays best-effort and returns false on failure", async () => {
    destroyMock.mockRejectedValue(new Error("boom"));

    await expect(deleteByPublicId("doc")).resolves.toBe(false);
  });
});
