import { handleGenerateDraft } from "./routes/ai.js";
import { handlePostInsights } from "./routes/insights.js";
import { handleRefreshInsights } from "./routes/insights-refresh.js";
import {
  handleConnectPage,
  handleOAuthStart,
  handleOAuthCallback,
} from "./routes/oauth.js";

import {
  handleAdminLoginPage,
  handleAdminLogin,
  handleAdminPostPage,
  handleAdminPost,
} from "./routes/admin.js";

import {
  handleShortToken,
  handleTokenExchange,
  handleProfile,
} from "./routes/tokens.js";

import { handleLogs } from "./routes/logs.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === "/") {
      return new Response("Second Horizon is running! 🚀");
    }

    if (pathname === "/connect" && method === "GET") {
      return handleConnectPage();
    }

    if (pathname === "/oauth/start" && method === "GET") {
      return handleOAuthStart(env);
    }

    if (pathname === "/oauth/callback" && method === "GET") {
      return handleOAuthCallback(url, env);
    }

    if (pathname === "/admin/login" && method === "GET") {
      return handleAdminLoginPage();
    }

    if (pathname === "/admin/login" && method === "POST") {
      return handleAdminLogin(request, env);
    }

    if (pathname === "/admin/post" && method === "GET") {
      return handleAdminPostPage(request, env);
    }

    if (pathname === "/admin/post" && method === "POST") {
      return handleAdminPost(request, env);
    }

    if (
      pathname === "/admin/ai/draft" &&
      method === "POST"
    ) {
      return handleGenerateDraft(request, env);
    }

    if (pathname === "/admin/logs" && method === "GET") {
      return handleLogs(request, env);
    }

    if (
      pathname === "/admin/insights" &&
      method === "GET"
    ) {
      return handlePostInsights(request, env, url);
    }

    if (
      pathname === "/admin/insights/refresh" &&
      method === "GET"
    ) {
      return handleRefreshInsights(request, env);
    }

    if (pathname === "/admin/token" && method === "GET") {
      return handleShortToken(env);
    }

    if (
      pathname === "/admin/exchange-token" &&
      method === "GET"
    ) {
      return handleTokenExchange(env);
    }

    if (pathname === "/admin/me" && method === "GET") {
      return handleProfile(env);
    }

    return Response.json(
      {
        ok: false,
        error: "Not found",
      },
      { status: 404 }
    );
  },
};
