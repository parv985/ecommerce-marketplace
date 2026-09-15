/*
 * Generates docs/postman-collection.json from the Swagger/OpenAPI
 * spec so every documented endpoint is available in Postman.
 * Run: npx tsx tests/generate-postman.ts
 */
import fs from "node:fs";
import path from "node:path";

import { swaggerSpec } from "../src/docs/swagger.js";

interface PostmanItem {
  name: string;
  request: {
    method: string;
    header: Array<{ key: string; value: string }>;
    url: {
      raw: string;
      host: string[];
      path: string[];
      query: Array<{ key: string; value: string }>;
    };
    auth?: {
      type: "bearer";
      bearer: Array<{ key: string; value: string; type: string }>;
    };
    description?: string;
  };
}

const convert = (): unknown => {
  const baseUrl =
    swaggerSpec.servers?.[0]?.url ??
    "http://localhost:5000";

  const folders = new Map<
    string,
    PostmanItem[]
  >();

  for (const [routePath, operations] of Object.entries(
    swaggerSpec.paths ?? {},
  )) {
    for (const [method, operation] of Object.entries(
      operations as Record<
        string,
        { tags?: string[]; summary?: string; description?: string }
      >,
    )) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) {
        continue;
      }

      const tag =
        operation.tags?.[0] ?? "General";
      const items =
        folders.get(tag) ?? [];

      /* {id} -> :id for Postman path variables. */
      const postmanPath = routePath.replace(
        /\{([^}]+)\}/g,
        ":$1",
      );

      const pathSegments = postmanPath
        .split("/")
        .filter(Boolean);

      const queryParams = (
        (operation as { parameters?: Array<{ in: string; name: string }> })
          .parameters ?? []
      )
        .filter((p) => p.in === "query")
        .map((p) => ({
          key: p.name,
          value: "",
        }));

      items.push({
        name:
          operation.summary ??
          `${method.toUpperCase()} ${postmanPath}`,
        request: {
          method: method.toUpperCase(),
          header: [
            {
              key: "Content-Type",
              value: "application/json",
            },
          ],
          url: {
            raw: `${baseUrl}${postmanPath}`,
            host: [baseUrl],
            path: pathSegments,
            query: queryParams,
          },
          auth: {
            type: "bearer",
            bearer: [
              {
                key: "token",
                value: "{{accessToken}}",
                type: "string",
              },
            ],
          },
          description: operation.description,
        },
      } as PostmanItem);

      folders.set(tag, items);
    }
  }

  const collection = {
    info: {
      name: "E-Commerce Marketplace API",
      description:
        "Generated from the OpenAPI spec. Set the accessToken collection variable by logging in via the Authentication folder (login returns an access token; 2FA-enabled sellers/admins must complete /auth/2fa/verify).",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: Array.from(folders.entries()).map(
      ([name, item]) => ({
        name,
        item,
      }),
    ),
    variable: [
      {
        key: "accessToken",
        value: "",
      },
    ],
  };

  const outDir = path.resolve("docs");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    "postman-collection.json",
  );

  fs.writeFileSync(
    outPath,
    JSON.stringify(collection, null, 2),
  );

  return {
    outPath,
    folders: folders.size,
    operations: Array.from(folders.values()).reduce(
      (sum, items) => sum + items.length,
      0,
    ),
  };
};

const result = convert();
console.log(
  `Wrote ${result.operations} operations across ${result.folders} folders to ${result.outPath}`,
);
