export function getCookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";

  const item = cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));

  return item ? item.slice(name.length + 1) : null;
}

export async function isAdminSessionValid(request, env) {
  const sessionId = getCookieValue(request, "admin_session");

  if (!sessionId) {
    return false;
  }

  const session = await env.THREADS_KV.get(
    `admin_session:${sessionId}`
  );

  return session === "valid";
}

export async function savePostLog(env, log) {
  const logId = `post_log:${Date.now()}:${crypto.randomUUID()}`;

  await env.THREADS_KV.put(
    logId,
    JSON.stringify({
      ...log,
      created_at: new Date().toISOString(),
    })
  );
}
