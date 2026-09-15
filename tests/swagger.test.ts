import { describe, expect, it } from "vitest";

import { swaggerSpec } from "../src/docs/swagger.js";
import { listAuditLogsQuerySchema } from "../src/modules/admin/admin.schema.js";

/*
 * The Swagger/OpenAPI spec is generated from the JSDoc blocks above the
 * route handlers, so it can silently drift from the implemented API.
 * These tests pin the documented contract of GET /api/v1/admin/audit-logs
 * to the schema the endpoint actually validates against.
 */

const PATH = "/api/v1/admin/audit-logs";

const spec = swaggerSpec as unknown as {
  paths: Record<
    string,
    Record<
      string,
      {
        tags?: string[];
        summary?: string;
        description?: string;
        security?: Array<Record<string, unknown>>;
        parameters?: Array<{
          name: string;
          in: string;
          schema?: Record<string, unknown>;
        }>;
        responses?: Record<
          string,
          {
            description?: string;
            content?: Record<
              string,
              {
                schema?:
                  | { $ref?: string }
                  | { properties?: Record<string, unknown> };
              }
            >;
          }
        >;
      }
    >
  >;
  components?: {
    schemas?: Record<string, { properties?: Record<string, unknown> }>;
  };
};

const operation = spec.paths[PATH]?.get;

/* Every key the query schema accepts (defaults included). */
const implementedParams = Object.keys(
  (
    listAuditLogsQuerySchema as unknown as {
      shape: Record<string, unknown>;
    }
  ).shape,
);

const param = (name: string) =>
  operation?.parameters?.find((p) => p.name === name);

describe("OpenAPI documentation for GET /api/v1/admin/audit-logs", () => {
  it("documents the endpoint under the Admin tag", () => {
    expect(operation).toBeDefined();
    expect(operation?.tags).toContain("Admin");
    expect(operation?.summary).toBeTruthy();
    expect(operation?.description).toContain("SUPER_ADMIN");
  });

  it("declares bearer authentication", () => {
    expect(operation?.security).toEqual([{ bearerAuth: [] }]);
  });

  it("documents exactly the query parameters the schema accepts", () => {
    const documented = (operation?.parameters ?? [])
      .filter((p) => p.in === "query")
      .map((p) => p.name);

    expect([...documented].sort()).toEqual(
      [...implementedParams].sort(),
    );
    expect(documented).toEqual([
      "actorId",
      "actorRole",
      "action",
      "entityType",
      "entityId",
      "fromDate",
      "toDate",
      "sortBy",
      "sortOrder",
      "page",
      "limit",
    ]);
  });

  it("documents the filters", () => {
    for (const name of [
      "actorId",
      "actorRole",
      "action",
      "entityType",
      "entityId",
    ]) {
      expect(param(name)?.schema?.type).toBe("string");
    }

    /* Known values are documented so the console can offer them. */
    expect(param("actorRole")).toBeTruthy();
    expect(String(param("actorRole")?.schema?.maxLength)).toBe(
      "50",
    );
    expect(param("action")?.description).toContain(
      "USER_STATUS_UPDATE",
    );
    expect(param("entityType")?.description).toContain("SETTLEMENT");
    expect(String(param("entityId")?.schema?.pattern)).toContain(
      "{24}",
    );
  });

  it("documents the date-range parameters", () => {
    expect(param("fromDate")?.schema?.format).toBe("date-time");
    expect(param("toDate")?.schema?.format).toBe("date-time");
    expect(param("toDate")?.description).toContain(
      "23:59:59.999 UTC",
    );
  });

  it("documents sorting parameters and their defaults", () => {
    expect(param("sortBy")?.schema?.enum).toEqual([
      "createdAt",
      "action",
      "entityType",
      "actorRole",
      "actorId",
    ]);
    expect(param("sortBy")?.schema?.default).toBe("createdAt");
    expect(param("sortOrder")?.schema?.enum).toEqual([
      "asc",
      "desc",
    ]);
    expect(param("sortOrder")?.schema?.default).toBe("desc");

    /* The documented defaults are the ones the schema applies. */
    const parsed = listAuditLogsQuerySchema.parse({});

    expect(parsed.sortBy).toBe(
      param("sortBy")?.schema?.default,
    );
    expect(parsed.sortOrder).toBe(
      param("sortOrder")?.schema?.default,
    );
  });

  it("documents pagination parameters and their defaults", () => {
    expect(param("page")?.schema).toMatchObject({
      type: "integer",
      minimum: 1,
      default: 1,
    });
    expect(param("limit")?.schema).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: 20,
    });

    const parsed = listAuditLogsQuerySchema.parse({});

    expect(parsed.page).toBe(param("page")?.schema?.default);
    expect(parsed.limit).toBe(param("limit")?.schema?.default);
  });

  it("rejects a limit above the documented maximum", () => {
    expect(
      listAuditLogsQuerySchema.safeParse({ limit: 101 })
        .success,
    ).toBe(false);
  });

  it("documents success and error responses", () => {
    const responses = operation?.responses ?? {};

    expect(Object.keys(responses).sort()).toEqual([
      "200",
      "400",
      "401",
      "403",
    ]);
    expect(responses["200"]?.description).toContain(
      "Audit logs fetched successfully",
    );
    expect(responses["403"]?.description).toContain(
      "SUPER_ADMIN",
    );
  });

  it("documents a paginated AuditLogList response body", () => {
    const schema =
      operation?.responses?.["200"]?.content?.[
        "application/json"
      ]?.schema as
        | { properties?: Record<string, { $ref?: string }> }
        | undefined;

    const dataRef = schema?.properties?.data?.$ref;

    expect(dataRef).toBe(
      "#/components/schemas/AuditLogList",
    );

    const list =
      spec.components?.schemas?.AuditLogList?.properties ?? {};

    expect(Object.keys(list).sort()).toEqual([
      "items",
      "limit",
      "page",
      "total",
      "totalPages",
    ]);

    const items = list.items as {
      type?: string;
      items?: { $ref?: string };
    };

    expect(items.type).toBe("array");
    expect(items.items?.$ref).toBe(
      "#/components/schemas/AuditLog",
    );
  });

  it("documents every field of an audit log entry", () => {
    const entry =
      spec.components?.schemas?.AuditLog?.properties ?? {};

    expect(Object.keys(entry).sort()).toEqual([
      "action",
      "actorId",
      "actorRole",
      "after",
      "before",
      "createdAt",
      "entityId",
      "entityType",
      "id",
      "metadata",
    ]);

    expect(
      (entry.createdAt as { format?: string }).format,
    ).toBe("date-time");
    expect(
      (entry.entityId as { nullable?: boolean }).nullable,
    ).toBe(true);
  });

  it("resolves every schema reference used by the endpoint", () => {
    const serialized = JSON.stringify(operation);
    const refs = [
      ...serialized.matchAll(/"\$ref":"([^"]+)"/g),
    ].map((match) => match[1]);

    expect(refs.length).toBeGreaterThan(0);

    for (const ref of refs) {
      const name = ref.split("/").pop()!;
      expect(
        spec.components?.schemas?.[name],
        `unresolved $ref: ${ref}`,
      ).toBeDefined();
    }
  });
});
