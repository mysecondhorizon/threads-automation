import { handleGenerateDraft } from "./routes/ai.js";
import { handleThreadContext } from "./routes/context.js";
import { handleAutoPost } from "./routes/auto-post.js";

import {
  handleAutoPostStatus,
} from "./routes/auto-post-status.js";

import {
  handleAutoPostPreview,
} from "./routes/auto-post-preview.js";

import {
  handleAutoPostPreviewPage,
} from "./routes/auto-post-preview-page.js";

import {
  handlePublishReviewedAutoPost,
} from "./routes/auto-post-publish-reviewed.js";

import {
  handleProductsPage,
} from "./routes/products-page.js";

import {
  handleProducts,
} from "./routes/products.js";

import {
  handlePostInsights,
} from "./routes/insights.js";

import {
  handleRefreshInsights,
} from "./routes/insights-refresh.js";

import {
  handleDashboard,
} from "./routes/dashboard.js";

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

import {
  handleLogs,
} from "./routes/logs.js";

import {
  runScheduledAutoPost,
} from "./services/auto-post/scheduler.js";

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(
        request.url
      );

    const {
      pathname,
    } = url;

    const method =
      request.method;

    if (
      pathname === "/"
    ) {
      return new Response(
        "Second Horizon is running! 🚀"
      );
    }

    if (
      pathname === "/connect" &&
      method === "GET"
    ) {
      return handleConnectPage();
    }

    if (
      pathname === "/oauth/start" &&
      method === "GET"
    ) {
      return handleOAuthStart(
        env
      );
    }

    if (
      pathname === "/oauth/callback" &&
      method === "GET"
    ) {
      return handleOAuthCallback(
        url,
        env
      );
    }

    if (
      pathname === "/admin/login" &&
      method === "GET"
    ) {
      return handleAdminLoginPage();
    }

    if (
      pathname === "/admin/login" &&
      method === "POST"
    ) {
      return handleAdminLogin(
        request,
        env
      );
    }

    if (
      pathname === "/admin/post" &&
      method === "GET"
    ) {
      return handleAdminPostPage(
        request,
        env
      );
    }

    if (
      pathname === "/admin/post" &&
      method === "POST"
    ) {
      return handleAdminPost(
        request,
        env
      );
    }

    if (
      pathname === "/admin/ai/draft" &&
      method === "POST"
    ) {
      return handleGenerateDraft(
        request,
        env
      );
    }

    if (
      pathname === "/admin/context" &&
      method === "GET"
    ) {
      return handleThreadContext(
        request,
        env
      );
    }

    if (
      pathname === "/admin/auto-post" &&
      method === "POST"
    ) {
      return handleAutoPost(
        request,
        env
      );
    }

    if (
      pathname === "/admin/auto-post/status" &&
      method === "GET"
    ) {
      return handleAutoPostStatus(
        request,
        env
      );
    }

    if (
      pathname === "/admin/auto-post/preview" &&
      (
        method === "GET" ||
        method === "POST"
      )
    ) {
      return handleAutoPostPreview(
        request,
        env
      );
    }

    if (
      pathname === "/admin/auto-post/preview-page" &&
      method === "GET"
    ) {
      return handleAutoPostPreviewPage(
        request,
        env
      );
    }

    if (
      pathname === "/admin/auto-post/publish-reviewed" &&
      method === "POST"
    ) {
      return handlePublishReviewedAutoPost(
        request,
        env
      );
    }

    if (
      pathname === "/admin/products-page" &&
      method === "GET"
    ) {
      return handleProductsPage(
        request,
        env
      );
    }

    if (
      pathname === "/admin/products" &&
      (
        method === "GET" ||
        method === "POST" ||
        method === "DELETE"
      )
    ) {
      return handleProducts(
        request,
        env
      );
    }

    if (
      pathname === "/admin/logs" &&
      method === "GET"
    ) {
      return handleLogs(
        request,
        env
      );
    }

    if (
      pathname === "/admin/dashboard" &&
      method === "GET"
    ) {
      return handleDashboard(
        request,
        env
      );
    }

    if (
      pathname === "/admin/insights" &&
      method === "GET"
    ) {
      return handlePostInsights(
        request,
        env,
        url
      );
    }

    if (
      pathname === "/admin/insights/refresh" &&
      method === "GET"
    ) {
      return handleRefreshInsights(
        request,
        env
      );
    }

    if (
      pathname === "/admin/token" &&
      method === "GET"
    ) {
      return handleShortToken(
        env
      );
    }

    if (
      pathname === "/admin/exchange-token" &&
      method === "GET"
    ) {
      return handleTokenExchange(
        env
      );
    }

    if (
      pathname === "/admin/me" &&
      method === "GET"
    ) {
      return handleProfile(
        env
      );
    }

    return Response.json(
      {
        ok:
          false,

        error:
          "Not found",
      },
      {
        status:
          404,
      }
    );
  },

  async scheduled(
    controller,
    env,
    ctx
  ) {
    ctx.waitUntil(
      runScheduledAutoPost(
        env,
        {
          cron:
            controller.cron,

          scheduledTime:
            controller.scheduledTime,
        }
      )
    );
  },
};