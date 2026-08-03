import { savePostLog } from "./utils.js";

export async function savePostFailureLog(env, step, text, details) {
  await savePostLog(env, {
    status: "failed",
    step,
    text,
    details,
  });
}

export async function savePostSuccessLog(
  env,
  { username, postId, text }
) {
  await savePostLog(env, {
    status: "published",
    username,
    post_id: postId,
    text,
  });
}

export async function handleLogs(request, env) {
  const list = await env.THREADS_KV.list({
    prefix: "post_log:",
  });

  const logs = await Promise.all(
    list.keys.map((item) =>
      env.THREADS_KV.get(item.name, "json")
    )
  );

  const validLogs = logs.filter(Boolean);

  validLogs.sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );

  return Response.json({
    ok: true,
    count: validLogs.length,
    logs: validLogs,
  });
}
