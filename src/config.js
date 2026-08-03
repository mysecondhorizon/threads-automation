import {
  WORKER_BASE_URL,
  OAUTH_REDIRECT_URI,
  THREADS_GRAPH_BASE,
  ADMIN_SESSION_TTL,
} from "./constants.js";

export const config = {
  app: {
    name: "Second Horizon",
    version: "0.2.0",
    baseUrl: WORKER_BASE_URL,
  },

  oauth: {
    redirectUri: OAUTH_REDIRECT_URI,
    scopes: [
      "threads_basic",
      "threads_content_publish",
    ],
  },

  threads: {
    graphBase: THREADS_GRAPH_BASE,
  },

  admin: {
    sessionTtl: ADMIN_SESSION_TTL,
  },
};
