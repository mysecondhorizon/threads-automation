const REDIRECT_URI =
  "https://mysecondhorizon-threads.secondhorizon-official.workers.dev/oauth/callback";

const ADMIN_SESSION_TTL = 60 * 60 * 8; // 8시간

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/connect") {
      return new Response(
        `
<!DOCTYPE html>
<html>
<head>
  <title>Second Horizon</title>
</head>
<body style="font-family:Arial;padding:40px;">
  <h1>🚀 Second Horizon</h1>
  <p>Threads 연결을 시작합니다.</p>
  <a href="/oauth/start">
    <button>Connect Threads</button>
  </a>
</body>
</html>
        `,
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        }
      );
    }

    if (url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
    
      if (error || !code || !state) {
        return Response.json(
          { ok: false, error: error || "Missing code or state" },
          { status: 400 }
        );
      }
    
      const savedState = await env.THREADS_KV.get(`oauth_state:${state}`);
    
      if (savedState !== "valid") {
        return Response.json(
          { ok: false, error: "Invalid or expired OAuth state" },
          { status: 400 }
        );
      }
    
      await env.THREADS_KV.delete(`oauth_state:${state}`);
    
      const form = new URLSearchParams({
        client_id: env.THREADS_APP_ID,
        client_secret: env.THREADS_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code,
      });
    
      const tokenResponse = await fetch(
        "https://graph.threads.net/oauth/access_token",
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form,
        }
      );
    
      const tokenData = await tokenResponse.json();
    
      if (!tokenResponse.ok || !tokenData.access_token) {
        return Response.json(
          {
            ok: false,
            error: "Token exchange failed",
            details: tokenData,
          },
          { status: 400 }
        );
      }
    
      await env.THREADS_KV.put(
        "threads_short_lived_token",
        JSON.stringify({
          access_token: tokenData.access_token,
          user_id: tokenData.user_id,
          saved_at: new Date().toISOString(),
        }),
        { expirationTtl: 3600 }
      );
    
      return Response.json({
        ok: true,
        token_received: true,
        user_id: tokenData.user_id,
      });
    }

    if (url.pathname === "/admin/token") {
      const token = await env.THREADS_KV.get("threads_short_lived_token");
    
      if (!token) {
        return Response.json({
          ok: false,
          message: "No token found",
        });
      }
    
      return Response.json(JSON.parse(token));
    }

    if (url.pathname === "/admin/exchange-token") {
      const savedToken = await env.THREADS_KV.get(
        "threads_short_lived_token",
        "json"
      );
    
      if (!savedToken?.access_token) {
        return Response.json(
          { ok: false, error: "Short-lived token not found" },
          { status: 400 }
        );
      }
    
      const exchangeUrl = new URL(
        "https://graph.threads.net/access_token"
      );
    
      exchangeUrl.searchParams.set("grant_type", "th_exchange_token");
      exchangeUrl.searchParams.set(
        "client_secret",
        env.THREADS_APP_SECRET
      );
      exchangeUrl.searchParams.set(
        "access_token",
        savedToken.access_token
      );
    
      const tokenResponse = await fetch(exchangeUrl);
      const tokenData = await tokenResponse.json();
    
      if (!tokenResponse.ok || !tokenData.access_token) {
        return Response.json(
          {
            ok: false,
            error: "Long-lived token exchange failed",
            details: tokenData,
          },
          { status: 400 }
        );
      }
    
      await env.THREADS_KV.put(
        "threads_auth",
        JSON.stringify({
          access_token: tokenData.access_token,
          user_id: savedToken.user_id,
          token_type: tokenData.token_type,
          expires_in: tokenData.expires_in,
          saved_at: new Date().toISOString(),
        })
      );
    
      return Response.json({
        ok: true,
        long_lived_token_saved: true,
        user_id: savedToken.user_id,
        expires_in: tokenData.expires_in,
      });
    }

    if (url.pathname === "/admin/me") {
      const auth = await env.THREADS_KV.get("threads_auth", "json");
    
      if (!auth?.access_token) {
        return Response.json(
          { ok: false, error: "Long-lived token not found" },
          { status: 400 }
        );
      }
    
      const meUrl = new URL("https://graph.threads.net/v1.0/me");
      meUrl.searchParams.set("fields", "id,username");
      meUrl.searchParams.set("access_token", auth.access_token);
    
      const response = await fetch(meUrl);
      const data = await response.json();

      if (response.ok && data.id) {
        await env.THREADS_KV.put(
          "threads_auth",
          JSON.stringify({
            ...auth,
            user_id: data.id,
            username: data.username,
            updated_at: new Date().toISOString(),
          })
        );
      }
    
      return Response.json({
        ok: response.ok,
        profile: data,
      });
    }

    if (url.pathname === "/admin/post-test") {
      const auth = await env.THREADS_KV.get("threads_auth", "json");
    
      if (!auth?.access_token) {
        return Response.json(
          { ok: false, error: "Long-lived token not found" },
          { status: 400 }
        );
      }

      const meResponse = await fetch(
        `https://graph.threads.net/v1.0/me?fields=id&access_token=${encodeURIComponent(auth.access_token)}`
      );
      
      const meData = await meResponse.json();
      
      if (!meResponse.ok || !meData.id) {
        return Response.json(
          { ok: false, step: "get_profile", details: meData },
          { status: 400 }
        );
      }

      const threadsUserId = meData.id;

      // 1. 게시 컨테이너 생성
      const createResponse = await fetch(
        `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            media_type: "TEXT",
            text: "🚀 Hello from Second Horizon!\n\n첫 번째 자동 게시 테스트입니다.",
            access_token: auth.access_token,
          }),
        }
      );
    
      const createData = await createResponse.json();
    
      if (!createResponse.ok) {
        return Response.json(
          {
            ok: false,
            step: "create_container",
            details: createData,
          },
          { status: 400 }
        );
      }
    
      // 2. 게시 실행
      const publishResponse = await fetch(
        `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            creation_id: createData.id,
            access_token: auth.access_token,
          }),
        }
      );
    
      const publishData = await publishResponse.json();
    
      return Response.json({
        ok: publishResponse.ok,
        create: createData,
        publish: publishData,
      });
    }

    if (url.pathname === "/oauth/start") {
      const state = crypto.randomUUID();

      await env.THREADS_KV.put(`oauth_state:${state}`, "valid", {
        expirationTtl: 600,
      });

      const authUrl = new URL("https://threads.net/oauth/authorize");
      authUrl.searchParams.set("client_id", env.THREADS_APP_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set(
        "scope",
        "threads_basic,threads_content_publish"
      );
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", state);

      return Response.redirect(authUrl.toString(), 302);
    }

    if (url.pathname === "/admin/post" && request.method === "GET") {
      const cookie = request.headers.get("cookie") || "";
      const sessionId = cookie
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith("admin_session="))
        ?.split("=")[1];
      
      const sessionValid = sessionId
        ? await env.THREADS_KV.get(`admin_session:${sessionId}`)
        : null;
      
      if (sessionValid !== "valid") {
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
    <body style="font-family: Arial, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 20px;">
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
          style="width: 100%; padding: 12px; box-sizing: border-box;"
          placeholder="Threads에 게시할 내용을 입력하세요."
        ></textarea>
    
        <br><br>
    
        <button
          type="submit"
          style="padding: 12px 20px; cursor: pointer;"
        >
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

    if (url.pathname === "/admin/post" && request.method === "POST") {
      const cookie = request.headers.get("cookie") || "";
      const sessionId = cookie
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith("admin_session="))
        ?.split("=")[1];
      
      const sessionValid = sessionId
        ? await env.THREADS_KV.get(`admin_session:${sessionId}`)
        : null;
      
      if (sessionValid !== "valid") {
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
    
      // 실제 Threads 사용자 ID 확인
      const meUrl = new URL("https://graph.threads.net/v1.0/me");
      meUrl.searchParams.set("fields", "id,username");
      meUrl.searchParams.set("access_token", auth.access_token);
    
      const meResponse = await fetch(meUrl);
      const meData = await meResponse.json();
    
      if (!meResponse.ok || !meData.id) {
        return Response.json(
          { ok: false, step: "get_profile", details: meData },
          { status: 400 }
        );
      }
    
      // 게시 컨테이너 생성
      const createBody = new URLSearchParams({
        media_type: "TEXT",
        text,
        access_token: auth.access_token,
      });
    
      const createResponse = await fetch(
        `https://graph.threads.net/v1.0/${meData.id}/threads`,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: createBody,
        }
      );
    
      const createData = await createResponse.json();
    
      if (!createResponse.ok || !createData.id) {
        return Response.json(
          { ok: false, step: "create_container", details: createData },
          { status: 400 }
        );
      }
    
      // 실제 게시
      const publishBody = new URLSearchParams({
        creation_id: createData.id,
        access_token: auth.access_token,
      });
    
      const publishResponse = await fetch(
        `https://graph.threads.net/v1.0/${meData.id}/threads_publish`,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: publishBody,
        }
      );
    
      const publishData = await publishResponse.json();
    
      if (!publishResponse.ok || !publishData.id) {
        return Response.json(
          { ok: false, step: "publish", details: publishData },
          { status: 400 }
        );
      }
    
      return Response.json({
        ok: true,
        username: meData.username,
        post_id: publishData.id,
        text,
      });
    }

    if (url.pathname === "/admin/login" && request.method === "GET") {
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
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
    
    if (url.pathname === "/admin/login" && request.method === "POST") {
      const formData = await request.formData();
      const adminKey = String(formData.get("admin_key") || "");
    
      if (adminKey !== env.ADMIN_KEY) {
        return new Response("관리자 키가 올바르지 않습니다.", { status: 401 });
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

    return new Response("Second Horizon is running! 🚀");
  },
};
