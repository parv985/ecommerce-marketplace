import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { google } from "googleapis";

import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import { verifyAccessToken } from "../src/utils/jwt.js";
import { GOOGLE_CALLBACK_PATH } from "../src/modules/auth/google.service.js";

import { api, clearDb, connect, disconnect } from "./helpers.js";

/**
 * Google OAuth (authorization-code flow) end to end.
 *
 * Only the two outbound HTTPS calls to Google are stubbed
 * (`OAuth2Client.getToken` + `OAuth2Client.verifyIdToken`); every line of
 * the real flow runs: the Express route, the state cookie, the code
 * exchange, the user upsert, the JWT/refresh-token issuance and the
 * redirect back to the frontend.
 */

const GOOGLE_PROFILE = {
  sub: "google-sub-123",
  email: "google.buyer@gmail.com",
  name: "Google Buyer",
  picture: "https://lh3.googleusercontent.com/a/pic",
};

const readCookie = (
  res: { headers: Record<string, string | string[] | undefined> },
  name: string,
): string | undefined => {
  const raw = res.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return cookies
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";")[0]
    ?.split("=")
    .slice(1)
    .join("=");
};

const stubGoogle = () => {
  const clientProto = google.auth.OAuth2.prototype as unknown as {
    getToken: unknown;
    verifyIdToken: unknown;
  };

  const getToken = vi
    .spyOn(clientProto as never, "getToken" as never)
    .mockResolvedValue({
      tokens: { id_token: "fake-google-id-token" },
    } as never);

  const verifyIdToken = vi
    .spyOn(clientProto as never, "verifyIdToken" as never)
    .mockResolvedValue({
      getPayload: () => GOOGLE_PROFILE,
    } as never);

  return { getToken, verifyIdToken };
};

/** Runs GET /auth/google and returns everything the callback needs. */
const startFlow = async (query = "") => {
  const res = await api.get(`/api/v1/auth/google${query}`);
  const target = new URL(res.headers.location as string);

  return {
    res,
    target,
    redirectUri: target.searchParams.get("redirect_uri"),
    state: target.searchParams.get("state"),
    stateCookie: readCookie(res, "oauth_state"),
  };
};

describe("Google OAuth (authorization-code flow)", () => {
  beforeAll(connect);
  beforeEach(async () => {
    await clearDb();
    vi.restoreAllMocks();
  });
  afterAll(disconnect);

  it("sends Google the exact callback URL this backend registers", async () => {
    const { res, target, redirectUri } = await startFlow();

    expect(res.status).toBe(302);
    expect(target.host).toBe("accounts.google.com");
    expect(target.pathname).toBe("/o/oauth2/v2/auth");

    /*
     * Regression guard for the reported bug: the redirect URI must be the
     * backend's own /api/v1/auth/google/callback route - not a frontend
     * path, and not a doubled prefix such as
     * "/auth/google/callback/api/v1/auth/google/callback", which Google
     * answers by sending the code somewhere the API never receives.
     */
    expect(new URL(redirectUri!).pathname).toBe(GOOGLE_CALLBACK_PATH);
    expect(redirectUri).toBe(env.GOOGLE_REDIRECT_URI);
  });

  it("issues a signed state and stores it in an httpOnly cookie", async () => {
    const { target, state, stateCookie, res } =
      await startFlow("?to=/wishlist");

    expect(state).toBeTruthy();
    expect(stateCookie).toBe(state);

    const cookieHeader = (res.headers["set-cookie"] as string[]).find(
      (cookie) => cookie.startsWith("oauth_state="),
    );

    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("Path=/api/v1/auth");

    // The requested page travels inside the signed state, not the URL.
    expect(target.searchParams.get("state")).toBe(stateCookie);
  });

  it("serves the callback on the very path sent to Google", async () => {
    const { redirectUri, state, stateCookie } = await startFlow();

    stubGoogle();

    const callbackPath = new URL(redirectUri!).pathname;

    const res = await api
      .get(callbackPath)
      .query({ code: "auth-code", state })
      .set("Cookie", `oauth_state=${stateCookie}`);

    // A 404 here is the bug this suite exists to prevent.
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(302);
  });

  it("exchanges the code, creates the user and redirects to the frontend with a session", async () => {
    const { getToken, verifyIdToken } = stubGoogle();
    const { redirectUri, state, stateCookie } = await startFlow();

    const res = await api
      .get("/api/v1/auth/google/callback")
      .query({
        code: "auth-code",
        state,
        iss: "https://accounts.google.com",
      })
      .set("Cookie", `oauth_state=${stateCookie}`);

    expect(getToken).toHaveBeenCalledWith({
      code: "auth-code",
      redirect_uri: redirectUri,
    });
    expect(verifyIdToken).toHaveBeenCalled();

    expect(res.status).toBe(302);

    const location = new URL(res.headers.location as string);
    expect(location.origin).toBe(env.CLIENT_URL);
    expect(location.pathname).toBe("/auth/google/callback");

    const accessToken = location.searchParams.get("access_token");
    expect(accessToken).toBeTruthy();

    // The issued token is a real session, signed by this backend.
    const payload = verifyAccessToken(accessToken!);
    expect(payload.type).toBe("access");

    // Refresh cookie for silent renewal after the access token expires.
    const refreshCookie = readCookie(res, "refreshToken");
    expect(refreshCookie).toBeTruthy();

    const user = await User.findOne({
      email: GOOGLE_PROFILE.email,
    });

    expect(user).toBeTruthy();
    expect(user!.googleId).toBe(GOOGLE_PROFILE.sub);
    expect(user!.authProvider).toBe("GOOGLE");
    expect(user!.role).toBe("BUYER");
    expect(user!.isEmailVerified).toBe(true);
    expect(user!.avatarUrl).toBe(GOOGLE_PROFILE.picture);
    expect(payload.userId).toBe(user!._id.toString());
  });

  it("produces a token the protected API accepts", async () => {
    const { state, stateCookie } = await startFlow();
    stubGoogle();

    const callback = await api
      .get("/api/v1/auth/google/callback")
      .query({ code: "auth-code", state })
      .set("Cookie", `oauth_state=${stateCookie}`);

    const accessToken = new URL(
      callback.headers.location as string,
    ).searchParams.get("access_token");

    const me = await api
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(GOOGLE_PROFILE.email);
  });

  it("links Google to an existing email/password account instead of duplicating it", async () => {
    await api.post("/api/v1/auth/register").send({
      name: "Existing Buyer",
      email: GOOGLE_PROFILE.email,
      password: "Password123!",
    });

    const { state, stateCookie } = await startFlow();
    stubGoogle();

    const res = await api
      .get("/api/v1/auth/google/callback")
      .query({ code: "auth-code", state })
      .set("Cookie", `oauth_state=${stateCookie}`);

    expect(res.status).toBe(302);

    const users = await User.find({
      email: GOOGLE_PROFILE.email,
    });

    expect(users).toHaveLength(1);
    expect(users[0]!.googleId).toBe(GOOGLE_PROFILE.sub);
    expect(users[0]!.authProvider).toBe("GOOGLE");

    // Email/password login still works for the same account.
    const login = await api.post("/api/v1/auth/login").send({
      email: GOOGLE_PROFILE.email,
      password: "Password123!",
    });

    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();
  });

  it("keeps the return path from the state and hands it to the frontend", async () => {
    const { state, stateCookie } = await startFlow("?to=/wishlist");
    stubGoogle();

    const res = await api
      .get("/api/v1/auth/google/callback")
      .query({ code: "auth-code", state })
      .set("Cookie", `oauth_state=${stateCookie}`);

    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get("to")).toBe("/wishlist");
  });

  it("rejects a callback whose state does not match the browser cookie", async () => {
    stubGoogle();
    const { state } = await startFlow();

    const res = await api
      .get("/api/v1/auth/google/callback")
      .query({ code: "auth-code", state })
      .set("Cookie", "oauth_state=some-other-state");

    expect(res.status).toBe(302);

    const location = new URL(res.headers.location as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("OAUTH_STATE_INVALID");

    // No session, no user.
    expect(await User.findOne({ email: GOOGLE_PROFILE.email })).toBeNull();
  });

  it("rejects a callback with no state at all", async () => {
    stubGoogle();

    const res = await api
      .get("/api/v1/auth/google/callback")
      .query({ code: "auth-code" });

    const location = new URL(res.headers.location as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("OAUTH_STATE_INVALID");
  });

  it("reports a denied Google consent back on the login page", async () => {
    const res = await api
      .get("/api/v1/auth/google/callback")
      .query({ error: "access_denied" });

    expect(res.status).toBe(302);

    const location = new URL(res.headers.location as string);
    expect(location.origin).toBe(env.CLIENT_URL);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("GOOGLE_ACCESS_DENIED");
  });

  it("restarts the flow when the callback is opened without a code", async () => {
    const res = await api.get("/api/v1/auth/google/callback");

    expect(res.status).toBe(302);

    const target = new URL(res.headers.location as string);
    expect(target.host).toBe("accounts.google.com");
    expect(target.searchParams.get("redirect_uri")).toBe(
      env.GOOGLE_REDIRECT_URI,
    );
    expect(readCookie(res, "oauth_state")).toBeTruthy();
  });

  it("sends the user back to the login page when Google rejects the code", async () => {
    const clientProto = google.auth.OAuth2.prototype as unknown as {
      getToken: unknown;
    };

    vi.spyOn(clientProto as never, "getToken" as never).mockRejectedValue(
      new Error("invalid_grant"),
    );

    const { state, stateCookie } = await startFlow();

    const res = await api
      .get("/api/v1/auth/google/callback")
      .query({ code: "expired-code", state })
      .set("Cookie", `oauth_state=${stateCookie}`);

    const location = new URL(res.headers.location as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("INVALID_AUTH_CODE");
  });

  it("still serves email/password login unchanged", async () => {
    await api.post("/api/v1/auth/register").send({
      name: "Password Buyer",
      email: "password@test.com",
      password: "Password123!",
    });

    const res = await api.post("/api/v1/auth/login").send({
      email: "password@test.com",
      password: "Password123!",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("BUYER");
    expect(readCookie(res, "refreshToken")).toBeTruthy();
  });
});
