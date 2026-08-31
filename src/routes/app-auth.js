import { config } from "../config.js";
import { resolveCurrentSession } from "../middleware/auth.js";
import { deleteKey, putText } from "../services/kv.js";
import {
  createStructuredAdminSessionValue,
  getUserByLoginId,
  listWorkspacesForOwner,
  verifyUserPassword,
} from "../services/login-foundation.js";
import { createCookie } from "../utils/cookie.js";
import { html } from "../utils/response.js";

function loginFailed() {
  return new Response("Authentication failed.", {
    status: 401,
    headers: { "cache-control": "no-store" },
  });
}

function createAppLoginRedirect(sessionId) {
  return new Response(null, {
    status: 302,
    headers: {
      location: "/app",
      "cache-control": "no-store",
      "set-cookie": createCookie("admin_session", sessionId, {
        maxAge: config.admin.sessionTtl,
      }),
    },
  });
}

export function handleAppLoginPage() {
  return html(`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in · Second Horizon</title>
  </head>
  <body style="font-family:Arial,sans-serif;max-width:420px;margin:60px auto;padding:20px;">
    <h1>Second Horizon</h1>
    <p>Sign in to continue to your Workspace.</p>
    <form method="POST" action="/app/login">
      <label for="app-login-id">Login ID</label>
      <input id="app-login-id" type="text" name="login_id" autocomplete="username" required style="width:100%;padding:12px;box-sizing:border-box;">
      <br><br>
      <label for="app-password">Password</label>
      <input id="app-password" type="password" name="password" autocomplete="current-password" required style="width:100%;padding:12px;box-sizing:border-box;">
      <br><br>
      <button type="submit" style="padding:12px 20px;">Sign in</button>
    </form>
  </body>
</html>`);
}

export async function handleAppLogin(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "POST", "cache-control": "no-store" },
    });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return loginFailed();
  }

  const loginId = formData.get("loginId") ?? formData.get("login_id");
  const password = formData.get("password");
  let user;
  try {
    user = await getUserByLoginId(env, String(loginId || ""));
  } catch {
    return loginFailed();
  }

  if (!user || !user.active || !await verifyUserPassword(env, user.id, String(password || ""))) {
    return loginFailed();
  }

  const activeWorkspaces = await listWorkspacesForOwner(env, user.id, {
    activeOnly: true,
  });
  const selectedWorkspaceId = activeWorkspaces.length === 1
    ? activeWorkspaces[0].id
    : null;
  const sessionId = crypto.randomUUID();
  const session = createStructuredAdminSessionValue(
    user.id,
    selectedWorkspaceId,
    { ttlSeconds: config.admin.sessionTtl },
  );

  await putText(
    env,
    `admin_session:${sessionId}`,
    JSON.stringify(session),
    { expirationTtl: config.admin.sessionTtl },
  );

  return createAppLoginRedirect(sessionId);
}

export async function handleAppLogout(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "POST", "cache-control": "no-store" },
    });
  }

  const current = await resolveCurrentSession(request, env);
  if (current && !current.session.legacy) {
    await deleteKey(env, `admin_session:${current.sessionId}`);
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: "/app/login",
      "cache-control": "no-store",
      "set-cookie": createCookie("admin_session", "", { maxAge: 0 }),
    },
  });
}
