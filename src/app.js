import { config } from "./config.js";

export function createApp(env) {
  return {
    config,
    env,

    kv: env.THREADS_KV,

    secrets: {
      appId: env.THREADS_APP_ID,
      appSecret: env.THREADS_APP_SECRET,
      adminKey: env.ADMIN_KEY,
    },
  };
}
