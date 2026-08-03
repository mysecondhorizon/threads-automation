export async function getJson(env, key) {
  return await env.THREADS_KV.get(key, "json");
}

export async function getText(env, key) {
  return await env.THREADS_KV.get(key);
}

export async function putJson(
  env,
  key,
  value,
  options = {}
) {
  return await env.THREADS_KV.put(
    key,
    JSON.stringify(value),
    options
  );
}

export async function putText(
  env,
  key,
  value,
  options = {}
) {
  return await env.THREADS_KV.put(
    key,
    value,
    options
  );
}

export async function deleteKey(env, key) {
  return await env.THREADS_KV.delete(key);
}

export async function listKeys(
  env,
  prefix = ""
) {
  return await env.THREADS_KV.list({
    prefix,
  });
}
