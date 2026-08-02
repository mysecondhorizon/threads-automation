const REDIRECT_URI =
  "https://mysecondhorizon-threads.secondhorizon-official.workers.dev/oauth/callback";

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

      return Response.json({
        code_received: Boolean(code),
        state_received: Boolean(state),
        error,
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

    return new Response("Second Horizon is running! 🚀");
  },
};
