import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));

function loadEnvFile() {
  try {
    const envPath = resolve(rootDir, ".env");
    if (!existsSync(envPath)) return {};
    const content = readFileSync(envPath, "utf8");
    const parsed = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      parsed[key] = val;
    }
    return parsed;
  } catch {
    return {};
  }
}

const envVars = loadEnvFile();

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  process.env.VITE_GOOGLE_CLIENT_ID ||
  envVars.GOOGLE_CLIENT_ID ||
  envVars.VITE_GOOGLE_CLIENT_ID ||
  "";

const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET ||
  envVars.GOOGLE_CLIENT_SECRET ||
  "";

const pendingStates = new Map();

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1:5173";
  return `${proto}://${host}`;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) rejectBody(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (e) {
        rejectBody(e);
      }
    });
    req.on("error", rejectBody);
  });
}

export function isGoogleAuthApiRequest(req) {
  const url = req.url || "";
  return url.startsWith("/api/auth/google");
}

export async function handleGoogleAuthApiRequest(req, res) {
  const baseUrl = getBaseUrl(req);
  const url = new URL(req.url || "/", baseUrl);
  const pathname = url.pathname;

  // 1. OAuth Callback: /api/auth/google/callback
  if (pathname === "/api/auth/google/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError || !code) {
      const dest = new URL("/", baseUrl);
      dest.searchParams.set("google_auth_error", oauthError || "Google sign-in was cancelled.");
      return redirect(res, dest.toString());
    }

    if (state && pendingStates.has(state)) {
      pendingStates.delete(state);
    }

    try {
      const redirectUri = `${baseUrl}/api/auth/google/callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID.trim(),
          client_secret: GOOGLE_CLIENT_SECRET.trim(),
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || tokenData.error || "Failed to exchange Google authorization code.");
      }

      const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();
      if (!profileRes.ok || !profile.email) {
        throw new Error("Could not retrieve Google user profile.");
      }

      const userPayload = {
        sub: profile.sub || `google-${Date.now()}`,
        email: profile.email,
        name: profile.name || profile.email.split("@")[0],
        givenName: profile.given_name,
        familyName: profile.family_name,
        picture: profile.picture,
        emailVerified: Boolean(profile.email_verified),
        hd: profile.hd,
        authMethod: "google_oauth",
        signedInAt: new Date().toISOString(),
      };

      const encoded = Buffer.from(JSON.stringify(userPayload), "utf8").toString("base64url");
      const dest = new URL("/", baseUrl);
      dest.searchParams.set("google_auth_profile", encoded);
      return redirect(res, dest.toString());
    } catch (err) {
      const dest = new URL("/", baseUrl);
      dest.searchParams.set("google_auth_error", err instanceof Error ? err.message : "Google authentication failed.");
      return redirect(res, dest.toString());
    }
  }

  // 2. Status or Redirect initiation: GET /api/auth/google
  if (pathname === "/api/auth/google" && req.method === "GET") {
    if (url.searchParams.get("status") === "1") {
      return sendJson(res, 200, {
        configured: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
        clientId: GOOGLE_CLIENT_ID,
        callbackUrl: `${baseUrl}/api/auth/google/callback`,
      });
    }

    const nonce = crypto.randomBytes(16).toString("hex");
    pendingStates.set(nonce, Date.now());
    const redirectUri = `${baseUrl}/api/auth/google/callback`;
    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID.trim());
    googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "openid email profile");
    googleAuthUrl.searchParams.set("state", nonce);
    googleAuthUrl.searchParams.set("prompt", "select_account");
    return redirect(res, googleAuthUrl.toString());
  }

  // 3. ID Token Verification: POST /api/auth/google
  if (pathname === "/api/auth/google" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      if (!body.credential) {
        return sendJson(res, 400, { error: "Missing Google credential token." });
      }
      const tokenRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.credential)}`,
      );
      if (!tokenRes.ok) {
        return sendJson(res, 401, { error: "Invalid Google ID token." });
      }
      const tokenInfo = await tokenRes.json();
      if (!tokenInfo.sub || !tokenInfo.email || tokenInfo.aud !== GOOGLE_CLIENT_ID.trim()) {
        return sendJson(res, 401, { error: "Google token audience mismatch." });
      }
      const userPayload = {
        sub: tokenInfo.sub,
        email: tokenInfo.email,
        name: tokenInfo.name || tokenInfo.email.split("@")[0],
        givenName: tokenInfo.given_name,
        familyName: tokenInfo.family_name,
        picture: tokenInfo.picture,
        emailVerified: tokenInfo.email_verified === "true" || tokenInfo.email_verified === true,
        hd: tokenInfo.hd,
        authMethod: "google_gis",
        signedInAt: new Date().toISOString(),
      };
      return sendJson(res, 200, { ok: true, user: userPayload });
    } catch (err) {
      return sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to verify Google token." });
    }
  }

  return sendJson(res, 404, { error: "Not found" });
}
