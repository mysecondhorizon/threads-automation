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
    <button>
      Connect Threads
    </button>
  </a>
</body>
</html>
        `,
        {
          headers: {
            "content-type": "text/html;charset=UTF-8",
          },
        }
      );
    }

    return new Response("Second Horizon is running! 🚀");
  },
};
