import { isAdminSessionValid } from "./utils.js";
import {
  getThreadsProfile,
  publishTextPost,
  ThreadsApiError,
} from "./threads.js";
import {
  savePostFailureLog,
  savePostSuccessLog,
} from "./logs.js";

const ADMIN_SESSION_TTL = 60 * 60 * 8;

export function handleAdminLoginPage() {
  return new Response(
    `<!DOCTYPE html>
<html lang="ko">
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
    <button type="submit" style="padding:12px 20px;">로그인</button>
  </form>
</body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    }
  );
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

  await env.THREADS_KV.put(
    `admin_session:${sessionId}`,
    "valid",
    { expirationTtl: ADMIN_SESSION_TTL }
  );

  return new Response(null, {
    status: 302,
    headers: {
      location: "/admin/post",
      "set-cookie":
        `admin_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ADMIN_SESSION_TTL}`,
    },
  });
}

export async function handleAdminPostPage(request, env) {
  const sessionValid = await isAdminSessionValid(request, env);

  if (!sessionValid) {
    return Response.redirect(
      "https://mysecondhorizon-threads.secondhorizon-official.workers.dev/admin/login",
      302
    );
  }

  return new Response(
    `<!DOCTYPE html>
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
    <label for="text">게시 내용</label><br><br>
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
    <button type="submit" style="padding:12px 20px;cursor:pointer;">
      Threads에 게시
    </button>
  </form>
</body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    }
  );
}

export async function handleAdminPost(request, env) {
  const sessionValid = await isAdminSessionValid(request, env);

  if (!sessionValid) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const text = String(formData.get("text") || "").trim();

  if (!text) {
    return Response.json(
      { ok: false, error: "게시 내용을 입력하세요." },
      { status: 400 }
    );
  }

  const auth = await env.THREADS_KV.get("threads_auth", "json");

  if (!auth?.access_token) {
    return Response.json(
      { ok: false, error: "Threads 연결 정보가 없습니다." },
      { status: 400 }
    );
  }

  try {
    const profile = await getThreadsProfile(auth.access_token);

    const result = await publishTextPost(
      auth.access_token,
      profile.id,
      text
    );

    await savePostSuccessLog(env, {
      username: profile.username,
      postId: result.postId,
      text,
    });

    return Response.json({
      ok: true,
      username: profile.username,
      post_id: result.postId,
      text,
    });
  } catch (error) {
    if (error instanceof ThreadsApiError) {
      await savePostFailureLog(
        env,
        error.step,
        text,
        error.details
      );

      return Response.json(
        {
          ok: false,
          step: error.step,
          details: error.details,
        },
        { status: 400 }
      );
    }

    return Response.json(
      {
        ok: false,
        error: "Unexpected server error",
      },
      { status: 500 }
    );
  }
}
