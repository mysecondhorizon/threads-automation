import { resolveCurrentSession } from "../middleware/auth.js";
import {
  getUserByLoginId,
  setUserPassword,
} from "../services/login-foundation.js";
import { html } from "../utils/response.js";

const CONFIRMATION = "RESET_USER_PASSWORD";
const ALLOWED_INPUT_KEYS = new Set([
  "loginId",
  "password",
  "confirm",
]);

function response(payload, status) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function failure(error, status, extra = {}) {
  return response({ ok: false, error, ...extra }, status);
}

function normalizeBrowserInput(loginId, password) {
  if (
    typeof loginId !== "string" ||
    typeof password !== "string"
  ) {
    return null;
  }

  const normalizedLoginId = loginId.trim();
  if (!normalizedLoginId || !password) return null;

  return { loginId: normalizedLoginId, password };
}

function normalizeJsonInput(loginId, password, confirm) {
  const input = normalizeBrowserInput(loginId, password);
  if (!input || typeof confirm !== "string" || confirm.trim() !== CONFIRMATION) return null;
  return input;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getContentTypeKind(contentType) {
  if (contentType.includes("application/x-www-form-urlencoded")) return "urlencoded";
  if (contentType.includes("multipart/form-data")) return "multipart";
  if (contentType.includes("application/json")) return "json";
  return "other";
}

function formDiagnostic(contentTypeKind, formParseSucceeded, fields = {}) {
  const loginId = fields.loginId;
  const password = fields.password;
  return {
    contentTypeKind,
    formParseSucceeded,
    loginIdPresent: loginId !== null && loginId !== undefined,
    loginIdIsString: typeof loginId === "string",
    passwordPresent: password !== null && password !== undefined,
    passwordIsString: typeof password === "string",
  };
}

async function parseInput(request) {
  const contentType = request.headers.get("content-type") || "";
  const contentTypeKind = getContentTypeKind(contentType);
  if (contentTypeKind === "urlencoded" || contentTypeKind === "multipart") {
    try {
      const formData = await request.formData();
      const fields = {
        loginId: formData.get("loginId"),
        password: formData.get("password"),
      };
      const input = normalizeBrowserInput(fields.loginId, fields.password);
      return { input, diagnostic: input ? null : formDiagnostic(contentTypeKind, true, fields) };
    } catch {
      return { input: null, diagnostic: formDiagnostic(contentTypeKind, false) };
    }
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return { input: null, diagnostic: null };
  }

  if (!isPlainObject(input) || Object.keys(input).some((key) => !ALLOWED_INPUT_KEYS.has(key))) {
    return { input: null, diagnostic: null };
  }

  return { input: normalizeJsonInput(input.loginId, input.password, input.confirm), diagnostic: null };
}

async function resolveTargetUser(env, input) {
  try {
    return await getUserByLoginId(env, input.loginId);
  } catch {
    return null;
  }
}

async function requireLegacyAdminSession(request, env) {
  const session = await resolveCurrentSession(request, env);
  if (!session) return failure("Unauthorized", 401);
  if (!session.session.legacy) return failure("Forbidden", 403);
  return null;
}

export async function handleAdminPasswordResetPage(request, env) {
  const denied = await requireLegacyAdminSession(request, env);
  if (denied) return denied;

  return html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reset User Password</title></head>
<body><main><h1>Reset User Password</h1><form method="post" action="/admin/maintenance/password-reset">
<label>Login ID <input name="loginId" autocomplete="username" required></label>
<label>New password <input type="password" name="password" autocomplete="new-password" required></label>
<button type="submit">Reset password</button>
</form></main></body></html>`);
}

export async function handleAdminPasswordReset(request, env) {
  if (request.method !== "POST") {
    return failure("Method Not Allowed", 405);
  }

  const denied = await requireLegacyAdminSession(request, env);
  if (denied) return denied;

  const parsed = await parseInput(request);
  if (!parsed.input) {
    return failure("Invalid password reset request", 400, parsed.diagnostic ? {
      diagnostic: parsed.diagnostic,
    } : {});
  }

  const user = await resolveTargetUser(env, parsed.input);
  if (!user) return failure("Password reset failed", 404);

  try {
    await setUserPassword(env, user.id, parsed.input.password);
  } catch {
    return failure("Password reset failed", 400);
  }

  return response({ ok: true }, 200);
}
