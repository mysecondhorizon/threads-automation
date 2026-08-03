import { config } from "../config.js";
import {
  requireAdminSession,
  requireAdminApiSession,
} from "../middleware/auth.js";
import { getJson, putText } from "../services/kv.js";
import {
  getThreadsProfile,
  publishTextPost,
  ThreadsApiError,
} from "../services/threads.js";
import {
  logPostSuccess,
  logPostFailure,
} from "../services/logger.js";
import { createCookie } from "../utils/cookie.js";
import { html, ok, fail } from "../utils/response.js";

export function handleAdminLoginPage() {
  return html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Second Horizon Admin</title>
</head>
<body style="font-family:Arial;max-width:420px;margin:60px auto;padding:20px;">
  <h1>Second Horizon Admin</h1>

  <form method="POST" action="/admin/login">
    <input
      type="password"
      name="admin_key"
      placeholder="ADMIN_KEY"
      required
      style="width:100%;padding:12px;box-sizing:border-box;"
    >

    <br><br>

    <button type="submit" style="padding:12px 20px;">
      로그인
    </button>
  </form>
</body>
</html>`);
}

export async function handleAdminLogin(request, env) {
  const formData = await request.formData();
  const adminKey = String(formData.get("admin_key") || "");

  if (adminKey !== env.ADMIN_KEY) {
    return new Response("관리자 키가 올바르지 않습니다.", {
      status: 401,
    });
  }

  const sessionId = crypto.randomUUID();

  await putText(
    env,
    `admin_session:${sessionId}`,
    "valid",
    {
      expirationTtl: config.admin.sessionTtl,
    }
  );

  return new Response(null, {
    status: 302,
    headers: {
      location: "/admin/post",
      "set-cookie": createCookie(
        "admin_session",
        sessionId,
        {
          maxAge: config.admin.sessionTtl,
        }
      ),
    },
  });
}

export async function handleAdminPostPage(request, env) {
  const auth = await requireAdminSession(request, env);

  if (!auth.ok) {
    return auth.response;
  }

  return html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Second Horizon Admin</title>
</head>
<body style="font-family:Arial,sans-serif;max-width:680px;margin:40px auto;padding:0 20px;">
  <h1>Second Horizon</h1>
  <h2>Threads 게시</h2>

  <form method="POST" action="/admin/post">
    <label for="text">게시 내용</label>

    <br><br>

    <textarea
      id="text"
      name="text"
      rows="10"
      maxlength="500"
      required
      style="width:100%;padding:12px;box-sizing:border-box;"
      placeholder="Threads에 게시할 내용을 입력하세요."
    ></textarea>

    <br><br>

    <button
      type="submit"
      style="padding:12px 20px;cursor:pointer;"
    >
      Threads에 게시
    </button>
  </form>
</body>
</html>`);
}

export async function handleAdminPost(request, env) {
  const adminAuth = await requireAdminApiSession(
    request,
    env
  );

  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  const formData = await request.formData();
  const text = String(formData.get("text") || "").trim();

  if (!text) {
    return fail("게시 내용을 입력하세요.", 400);
  }

  const threadsAuth = await getJson(env, "threads_auth");

  if (!threadsAuth?.access_token) {
    return fail("Threads 연결 정보가 없습니다.", 400);
  }

  try {
    const profile = await getThreadsProfile(
      threadsAuth.access_token
    );

    const result = await publishTextPost(
      threadsAuth.access_token,
      profile.id,
      text
    );

    await logPostSuccess(
      env,
      profile.username,
      result.postId,
      text
    );

    return ok({
      username: profile.username,
      post_id: result.postId,
      text,
    });
  } catch (error) {
    if (error instanceof ThreadsApiError) {
      await logPostFailure(
        env,
        error.step,
        text,
        error.details
      );

      return fail(
        "Threads post failed",
        400,
        {
          step: error.step,
          details: error.details,
        }
      );
    }

    return fail("Unexpected server error", 500);
  }
}
