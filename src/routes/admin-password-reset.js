import { resolveCurrentSession } from "../middleware/auth.js";
import {
  getUserById,
  getUserByLoginId,
  setUserPassword,
} from "../services/login-foundation.js";
import { html } from "../utils/response.js";

const CONFIRMATION = "RESET_USER_PASSWORD";
const ALLOWED_INPUT_KEYS = new Set([
  "userId",
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

function failure(error, status) {
  return response({ ok: false, error }, status);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function parseInput(request) {
  let input;
  try {
    const contentType = request.headers.get("content-type") || "";
    input = contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
      ? Object.fromEntries(await request.formData())
      : await request.json();
  } catch {
    return null;
  }

  if (
    !isPlainObject(input) ||
    Object.keys(input).some((key) => !ALLOWED_INPUT_KEYS.has(key)) ||
    input.confirm !== CONFIRMATION ||
    typeof input.password !== "string"
  ) {
    return null;
  }

  const hasUserId = typeof input.userId === "string" && input.userId.trim().length > 0;
  const hasLoginId = typeof input.loginId === "string" && input.loginId.trim().length > 0;
  if (hasUserId === hasLoginId) return null;

  return input;
}

async function resolveTargetUser(env, input) {
  try {
    return input.userId
      ? await getUserById(env, input.userId)
      : await getUserByLoginId(env, input.loginId);
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
<label>User ID <input name="userId" autocomplete="off"></label>
<label>or login ID <input name="loginId" autocomplete="username"></label>
<label>New password <input type="password" name="password" autocomplete="new-password" required></label>
<label>Confirmation <input name="confirm" placeholder="RESET_USER_PASSWORD" required></label>
<button type="submit">Reset password</button>
</form></main></body></html>`);
}

export async function handleAdminPasswordReset(request, env) {
  if (request.method !== "POST") {
    return failure("Method Not Allowed", 405);
  }

  const denied = await requireLegacyAdminSession(request, env);
  if (denied) return denied;

  const input = await parseInput(request);
  if (!input) return failure("Invalid password reset request", 400);

  const user = await resolveTargetUser(env, input);
  if (!user) return failure("Password reset failed", 404);

  try {
    await setUserPassword(env, user.id, input.password);
  } catch {
    return failure("Password reset failed", 400);
  }

  return response({ ok: true }, 200);
}
