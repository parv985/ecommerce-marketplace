import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Response as SupertestResponse } from "supertest";
import { google } from "googleapis";

/*
 * Google OAuth (authorization-code flow) — wiring tests.
 *
 * These run without MongoDB (persistence is mocked, following the same
 * pattern as the other unit suites) so they can guard the OAuth wiring in
 * CI and in sandboxes without a database:
 *
 *   - the callback route the backend registers is exactly the redirect URI
 *     sent to Google (the doubled-prefix 404 regression),
 *   - the code exchange sends that same redirect URI back to Google,
 *   - the browser is handed back to the frontend's /auth/google/callback
 *     route with a real, verifiable access token + refresh cookie,
 *   - the state cookie/parameter protects the callback.
 *
 * `tests/auth-google-oauth.test.ts` covers the same flow against a real
 * database.
 */

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI =
    "mongodb://localhost:27017/ecommerce_marketplace_unit";
  process.env.CLIENT_URL = "http://localhost:3000";
  process.env.JWT_ACCESS_SECRET =
    "unit-test-access-secret-unit-test-access-secret";
  process.env.JWT_REFRESH_SECRET =
    "unit-test-refresh-secret-unit-test-refresh-secret";
  process.env.CLOUDINARY_CLOUD_NAME = "unit-test";
  process.env.CLOUDINARY_API_KEY = "unit-test";
  process.env.CLOUDINARY_API_SECRET = "unit-test";
  process.env.GOOGLE_CLIENT_ID =
    "unit-test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "unit-test-client-secret";
  process.env.GOOGLE_REDIRECT_URI =
    "http://localhost:5000/api/v1/auth/google/callback";
});

vi.mock("../../src/models/User.js", () => ({
  User: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../src/modules/auth/auth.repository.js", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  findUserForAuth: vi.fn(),
  revokeAllRefreshTokensForUser: vi.fn(),
  findUserForTwoFactor: vi.fn(),
  createUser: vi.fn(),
  createRefreshToken: vi.fn(async () => ({})),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  createPasswordResetToken: vi.fn(),
  findPasswordResetToken: vi.fn(),
  markPasswordResetTokenUsed: vi.fn(),
}));

import app from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { User } from "../../src/models/User.js";
import { createRefreshToken } from "../../src/modules/auth/auth.repository.js";
import {
  GOOGLE_CALLBACK_PATH,
  describeGoogleOAuthConfig,
  resolveGoogleRedirectUri,
} from "../../src/modules/auth/google.service.js";
import { verifyAccessToken } from "../../src/utils/jwt.js";

const GOOGLE_PROFILE = {
  sub: "google-sub-123",
  email: "google.buyer@gmail.com",
  name: "Google Buyer",
  picture: "https://lh3.googleusercontent.com/a/pic",
};

const fakeUserDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: "user-id-1",
  name: GOOGLE_PROFILE.name,
  email: GOOGLE_PROFILE.email,
  role: "BUYER",
  googleId: GOOGLE_PROFILE.sub,
  authProvider: "GOOGLE",
  avatarUrl: GOOGLE_PROFILE.picture,
  isEmailVerified: true,
  isActive: true,
  lastLoginAt: null,
  save: vi.fn(async () => {}),
  ...overrides,
});

const readCookie = (
  res: SupertestResponse,
  name: string,
): string | undefined => {
  const cookies = (res.headers["set-cookie"] ?? []) as string[];

  return cookies
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";")[0]
    ?.slice(name.length + 1);
};

const cookieHeader = (
  res: SupertestResponse,
  name: string,
): string | undefined =>
  ((res.headers["set-cookie"] ?? []) as string[]).find((cookie) =>
    cookie.startsWith(`${name}=`),
  );

/** Stubs only the two outbound HTTPS calls made to Google. */
const stubGoogle = () => {
  const proto = google.auth.OAuth2.prototype as unknown as Record<
    string,
    unknown
  >;

  const getToken = vi.spyOn(proto, "getToken").mockResolvedValue({
    tokens: { id_token: "fake-google-id-token" },
  } as never);

  const verifyIdToken = vi.spyOn(proto, "verifyIdToken").mockResolvedValue({
    getPayload: () => GOOGLE_PROFILE,
  } as never);

  return { getToken, verifyIdToken };
};

const startFlow = async (query = "") => {
  const res = await request(app).get(`/api/v1/auth/google${query}`);
  const target = new URL(res.headers.location as string);

  return {
    res,
    target,
    redirectUri: target.searchParams.get("redirect_uri"),
    state: target.searchParams.get("state"),
    stateCookie: readCookie(res, "oauth_state"),
  };
};

const runCallback = (query: Record<string, string>, cookie?: string) => {
  const req = request(app).get("/api/v1/auth/google/callback").query(query);

  return cookie ? req.set("Cookie", cookie) : req;
};

describe("Google OAuth flow wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    (User.findOne as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    (User.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeUserDoc(),
    );
  });

  it("asks Google to redirect to the exact route this backend registers", async () => {
    const { res, target, redirectUri } = await startFlow();

    expect(res.status).toBe(302);
    expect(target.host).toBe("accounts.google.com");

    /*
     * The regression: a redirect URI like
     * "http://localhost:3000/auth/google/callback/api/v1/auth/google/callback"
     * sends the code to a path the API never serves, so the SPA renders its
     * catch-all 404 and the user is never signed in.
     */
    expect(new URL(redirectUri!).pathname).toBe(GOOGLE_CALLBACK_PATH);
    expect(redirectUri).toBe(env.GOOGLE_REDIRECT_URI);
  });

  it("serves that very path (no duplicated /api/v1/auth prefix, no 404)", async () => {
    const { redirectUri, state, stateCookie } = await startFlow();
    stubGoogle();

    const res = await runCallback(
      { code: "auth-code", state: state! },
      `oauth_state=${stateCookie}`,
    );

    expect(new URL(redirectUri!).pathname).toBe("/api/v1/auth/google/callback");
    expect(res.status).toBe(302);
    expect(res.body?.code).not.toBe("ROUTE_NOT_FOUND");
  });

  it("signs the state and stores the same value in an httpOnly cookie", async () => {
    const { res, state, stateCookie } = await startFlow();

    expect(state).toBeTruthy();
    expect(stateCookie).toBe(state);
    expect(cookieHeader(res, "oauth_state")).toContain("HttpOnly");
    expect(cookieHeader(res, "oauth_state")).toContain("Path=/api/v1/auth");
  });

  it("exchanges the code, creates the Google user and redirects to the frontend", async () => {
    const { getToken, verifyIdToken } = stubGoogle();
    const { redirectUri, state, stateCookie } = await startFlow();

    const res = await runCallback(
      {
        code: "auth-code",
        state: state!,
        iss: "https://accounts.google.com",
      },
      `oauth_state=${stateCookie}`,
    );

    // The exchange must reuse the redirect URI Google was given.
    expect(getToken).toHaveBeenCalledWith({
      code: "auth-code",
      redirect_uri: redirectUri,
    });
    expect(verifyIdToken).toHaveBeenCalled();

    expect(res.status).toBe(302);

    const location = new URL(res.headers.location as string);
    expect(location.origin).toBe(env.CLIENT_URL);
    expect(location.pathname).toBe("/auth/google/callback");

    // A real session: signed access token + persisted refresh token.
    const accessToken = location.searchParams.get("access_token")!;
    const payload = verifyAccessToken(accessToken);
    expect(payload.type).toBe("access");
    expect(payload.userId).toBe("user-id-1");
    expect(payload.role).toBe("BUYER");

    const refreshCookie = readCookie(res, "refreshToken");
    expect(refreshCookie).toBeTruthy();

    const stored = (createRefreshToken as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0] as { tokenHash: string };
    expect(stored.tokenHash).toBeTruthy();
    expect(stored.tokenHash).not.toBe(refreshCookie);

    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: GOOGLE_PROFILE.email,
        googleId: GOOGLE_PROFILE.sub,
        authProvider: "GOOGLE",
        role: "BUYER",
        isEmailVerified: true,
        avatarUrl: GOOGLE_PROFILE.picture,
      }),
    );
  });

  it("links an existing email/password account instead of creating a second one", async () => {
    const existing = fakeUserDoc({
      googleId: undefined,
      authProvider: "LOCAL",
      avatarUrl: null,
    });
    (User.findOne as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      existing,
    );

    stubGoogle();
    const { state, stateCookie } = await startFlow();

    const res = await runCallback(
      { code: "auth-code", state: state! },
      `oauth_state=${stateCookie}`,
    );

    expect(res.status).toBe(302);
    expect(User.create).not.toHaveBeenCalled();
    expect(existing.save).toHaveBeenCalled();
    expect(existing.googleId).toBe(GOOGLE_PROFILE.sub);
    expect(existing.authProvider).toBe("GOOGLE");
  });

  it("passes the requested return path through to the frontend", async () => {
    stubGoogle();
    const { state, stateCookie } = await startFlow("?to=/wishlist");

    const res = await runCallback(
      { code: "auth-code", state: state! },
      `oauth_state=${stateCookie}`,
    );

    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get("to")).toBe("/wishlist");
  });

  it("drops an external return path from the state", async () => {
    stubGoogle();
    const { state, stateCookie } = await startFlow(
      "?to=https://evil.example.com",
    );

    const res = await runCallback(
      { code: "auth-code", state: state! },
      `oauth_state=${stateCookie}`,
    );

    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get("to")).toBeNull();
  });

  it("refuses a callback whose state does not match the browser cookie", async () => {
    stubGoogle();
    const { state } = await startFlow();

    const res = await runCallback(
      { code: "auth-code", state: state! },
      "oauth_state=another-browser",
    );

    const location = new URL(res.headers.location as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("OAUTH_STATE_INVALID");
    expect(User.create).not.toHaveBeenCalled();
  });

  it("refuses a callback with no state at all", async () => {
    stubGoogle();

    const res = await runCallback({ code: "auth-code" });

    const location = new URL(res.headers.location as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("OAUTH_STATE_INVALID");
  });

  it("refuses a forged state value", async () => {
    stubGoogle();

    const forged = `${Buffer.from(
      JSON.stringify({ nonce: "x", exp: Date.now() + 60_000 }),
    ).toString("base64url")}.deadbeef`;

    const res = await runCallback(
      { code: "auth-code", state: forged },
      `oauth_state=${forged}`,
    );

    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get("error")).toBe("OAUTH_STATE_INVALID");
  });

  it("reports a denied Google consent on the login page", async () => {
    const res = await runCallback({
      error: "access_denied",
    });

    const location = new URL(res.headers.location as string);
    expect(location.origin).toBe(env.CLIENT_URL);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("GOOGLE_ACCESS_DENIED");
  });

  it("restarts the flow when the callback is opened without a code", async () => {
    const res = await request(app).get("/api/v1/auth/google/callback");

    expect(res.status).toBe(302);

    const target = new URL(res.headers.location as string);
    expect(target.host).toBe("accounts.google.com");
    expect(target.searchParams.get("redirect_uri")).toBe(
      env.GOOGLE_REDIRECT_URI,
    );
    expect(readCookie(res, "oauth_state")).toBeTruthy();
  });

  it("sends the user to the login page when Google rejects the code", async () => {
    const proto = google.auth.OAuth2.prototype as unknown as Record<
      string,
      unknown
    >;
    vi.spyOn(proto, "getToken").mockRejectedValue(new Error("invalid_grant"));

    const { state, stateCookie } = await startFlow();

    const res = await runCallback(
      { code: "expired-code", state: state! },
      `oauth_state=${stateCookie}`,
    );

    const location = new URL(res.headers.location as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("INVALID_AUTH_CODE");
  });

  it("clears the single-use state cookie on the callback", async () => {
    stubGoogle();
    const { state, stateCookie } = await startFlow();

    const res = await runCallback(
      { code: "auth-code", state: state! },
      `oauth_state=${stateCookie}`,
    );

    const cleared = cookieHeader(res, "oauth_state");
    expect(cleared).toBeTruthy();
    expect(cleared).toMatch(/oauth_state=;/);
  });
});

describe("Google OAuth configuration resolution", () => {
  const original = env.GOOGLE_REDIRECT_URI;

  it("honours GOOGLE_REDIRECT_URI when it is absolute", () => {
    expect(resolveGoogleRedirectUri()).toBe(
      "http://localhost:5000/api/v1/auth/google/callback",
    );
  });

  it("derives the callback URL from the request when unset (Render / previews)", () => {
    env.GOOGLE_REDIRECT_URI = undefined;

    try {
      const req = {
        get: (header: string) =>
          header.toLowerCase() === "host"
            ? "nexcart-api.onrender.com"
            : header.toLowerCase() === "x-forwarded-proto"
              ? "https"
              : undefined,
        protocol: "http",
      };

      expect(
        resolveGoogleRedirectUri(
          req as unknown as Parameters<typeof resolveGoogleRedirectUri>[0],
        ),
      ).toBe("https://nexcart-api.onrender.com/api/v1/auth/google/callback");
    } finally {
      env.GOOGLE_REDIRECT_URI = original;
    }
  });

  it("flags a redirect URI whose path is not the registered callback", () => {
    env.GOOGLE_REDIRECT_URI =
      "http://localhost:3000/auth/google/callback/api/v1/auth/google/callback";

    try {
      const report = describeGoogleOAuthConfig().join("\n");

      expect(report).toContain("WARNING");
      expect(report).toContain(GOOGLE_CALLBACK_PATH);
    } finally {
      env.GOOGLE_REDIRECT_URI = original;
    }
  });
});
