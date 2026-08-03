import { putJson, listKeys, getJson } from "./kv.js";

export async function logPostSuccess(
  env,
  username,
  postId,
  text
) {
  const key = `post_log:${Date.now()}:${crypto.randomUUID()}`;

  await putJson(env, key, {
    status: "published",
    username,
    post_id: postId,
    text,
    created_at: new Date().toISOString(),
  });
}

export async function logPostFailure(
  env,
  step,
  text,
  details
) {
  const key = `post_log:${Date.now()}:${crypto.randomUUID()}`;

  await putJson(env, key, {
    status: "failed",
    step,
    text,
    details,
    created_at: new Date().toISOString(),
  });
}

export async function getPostLogs(env) {
  const list = await listKeys(env, "post_log:");

  const logs = await Promise.all(
    list.keys.map((item) => getJson(env, item.name))
  );

  return logs
    .filter(Boolean)
    .sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
}
