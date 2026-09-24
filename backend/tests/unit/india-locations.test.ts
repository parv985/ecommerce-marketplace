import { describe, expect, it } from "vitest";

import {
  getCanonicalIndianState,
  getCityStateCandidates,
  getIndianCitiesForState,
  getIndianStates,
  isCityInState,
  isValidIndianState,
} from "../../src/utils/indiaLocations.js";

import {
  sellerRegistrationSchema,
  updateSellerProfileSchema,
} from "../../src/modules/sellers/seller.schema.js";

/*
 * The State/City dataset helpers and the schema-level pair checks they
 * power. These are pure (no MongoDB, no env), so they run in both the
 * unit suite and the integration suite.
 */

const validRegistration = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  name: "Test Seller",
  email: "location@test.com",
  password: "Password123!",
  businessName: "Location Traders",
  gstin: "27ABCDE1234F1ZV",
  pan: "ABCDE1234F",
  bankAccountHolderName: "Test Seller",
  bankAccountNumber: "123456789012",
  ifscCode: "HDFC0001234",
  addressLine1: "1 Main Road",
  city: "Pune",
  state: "Maharashtra",
  pincode: "411001",
  ...overrides,
});

describe("indiaLocations dataset helpers", () => {
  it("lists every Indian state and union territory", () => {
    const states = getIndianStates();

    expect(states.length).toBeGreaterThanOrEqual(36);
    expect(states).toContain("Gujarat");
    expect(states).toContain("Delhi");
    expect(states).toContain("Odisha");
    expect(states).toContain("Maharashtra");
  });

  it("resolves states by canonical name or ISO code, case-insensitively", () => {
    expect(isValidIndianState("Gujarat")).toBe(true);
    expect(isValidIndianState("gujarat ")).toBe(true);
    expect(isValidIndianState("GJ")).toBe(true);
    expect(isValidIndianState("mh")).toBe(true);

    expect(isValidIndianState("Atlantis")).toBe(false);
    expect(isValidIndianState("")).toBe(false);

    expect(getCanonicalIndianState("GJ")).toBe("Gujarat");
    expect(getCanonicalIndianState("Gujarat")).toBe("Gujarat");
    expect(getCanonicalIndianState("zz")).toBeNull();
  });

  it("lists a state's cities and rejects mismatched pairs", () => {
    const maharashtra = getIndianCitiesForState("MH");

    expect(maharashtra).toContain("Pune");
    expect(getIndianCitiesForState("Atlantis")).toEqual([]);

    expect(isCityInState("Pune", "Maharashtra")).toBe(true);
    expect(isCityInState("pune ", "mh")).toBe(true);
    expect(isCityInState("Pune", "Gujarat")).toBe(false);
    expect(isCityInState("Ahmedabad", "Maharashtra")).toBe(false);
  });

  it("reports every state that contains an ambiguous city name", () => {
    expect(getCityStateCandidates("Aurangabad")).toEqual([
      "Bihar",
      "Maharashtra",
    ]);
    expect(getCityStateCandidates("Ahmedabad")).toEqual(["Gujarat"]);
    expect(getCityStateCandidates("Nowhereville")).toEqual([]);
  });
});

describe("sellerRegistrationSchema state/city pair", () => {
  it("accepts a matching canonical pair", () => {
    const result = sellerRegistrationSchema.safeParse(validRegistration());

    expect(result.success).toBe(true);
  });

  it("accepts an ISO-code state and case-insensitive input", () => {
    const result = sellerRegistrationSchema.safeParse(
      validRegistration({ state: "mh", city: "pune" }),
    );

    expect(result.success).toBe(true);
  });

  it("rejects an unknown state", () => {
    const result = sellerRegistrationSchema.safeParse(
      validRegistration({ state: "Atlantis" }),
    );

    expect(result.success).toBe(false);
    const issues = (
      result as {
        error: { issues: Array<{ path: Array<unknown>; message: string }> };
      }
    ).error.issues;
    const stateIssue = issues.find((issue) => issue.path.includes("state"));

    expect(stateIssue?.message).toBe("Not a valid Indian state");
  });

  it("rejects a city that does not belong to the state", () => {
    const result = sellerRegistrationSchema.safeParse(
      validRegistration({ state: "Maharashtra", city: "Patna" }),
    );

    expect(result.success).toBe(false);
    const issues = (
      result as {
        error: { issues: Array<{ path: Array<unknown>; message: string }> };
      }
    ).error.issues;
    const cityIssue = issues.find((issue) => issue.path.includes("city"));

    expect(cityIssue?.message).toBe('"Patna" is not a city in Maharashtra');
  });

  it("still enforces presence before the pair check", () => {
    const result = sellerRegistrationSchema.safeParse(
      validRegistration({ state: "" }),
    );

    expect(result.success).toBe(false);
    const issues = (result as { error: { issues: Array<{ message: string }> } })
      .error.issues;

    expect(issues.some((issue) => issue.message === "State is required")).toBe(
      true,
    );
  });
});

describe("updateSellerProfileSchema state/city pair", () => {
  it("accepts a matching pair patch", () => {
    const result = updateSellerProfileSchema.safeParse({
      city: "Ahmedabad",
      state: "Gujarat",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a mismatched pair when both sides are sent", () => {
    const result = updateSellerProfileSchema.safeParse({
      city: "Pune",
      state: "Gujarat",
    });

    expect(result.success).toBe(false);
    const issues = (
      result as {
        error: { issues: Array<{ path: Array<unknown>; message: string }> };
      }
    ).error.issues;
    const cityIssue = issues.find((issue) => issue.path.includes("city"));

    expect(cityIssue?.message).toBe('"Pune" is not a city in Gujarat');
  });

  it("rejects an unknown state on a state-only patch", () => {
    const result = updateSellerProfileSchema.safeParse({
      state: "Atlantis",
    });

    expect(result.success).toBe(false);
    const issues = (
      result as {
        error: { issues: Array<{ path: Array<unknown>; message: string }> };
      }
    ).error.issues;

    expect(issues.some((issue) => issue.path.includes("state"))).toBe(true);
  });

  it("defers a city-only patch to the service (pair needs the stored state)", () => {
    const result = updateSellerProfileSchema.safeParse({ city: "Patna" });

    expect(result.success).toBe(true);
  });

  it("leaves unrelated field patches untouched", () => {
    const result = updateSellerProfileSchema.safeParse({
      businessName: "Updated Traders",
      phone: "9876543210",
    });

    expect(result.success).toBe(true);
  });
});
