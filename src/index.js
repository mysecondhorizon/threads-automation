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
  handleProductBatchUpload,
} from "./routes/products.js";

import {
  handleProductReviews,
} from "./routes/product-review.js";

import {
  handleProductReviewPage,
} from "./routes/product-review-page.js";

import {
  handleMediaManagementPage,
} from "./routes/media-management-page.js";

import {
  handleMediaLibrary,
  handleMediaBatchUpload,
  handleContentPool,
  handleWeeklyInventory,
} from "./routes/media-management.js";

import {
  handlePublicMedia,
} from "./routes/media-public.js";

import {
  handleScheduleStatus,
} from "./routes/schedule-status.js";

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
  handleAdminHomePage,
  handleEndpointOverviewPage,
} from "./routes/admin-overview.js";

import {
  handleAppHome,
  handleAppPlaceholderPage,
} from "./routes/app-shell.js";

import {
  handleAppSchedulesPage,
} from "./routes/app-schedules-page.js";

import {
  handleScheduleById,
  handleSchedulesCollection,
} from "./routes/api-schedules.js";

import {
  handleAppWritePage,
} from "./routes/app-write-page.js";

import {
  handleAppMediaPage,
} from "./routes/app-media-page.js";

import { handleAppProductsPage } from "./routes/app-products-page.js";
import { handleOperatorProductAnalyze } from "./routes/api-product-analyze.js";
import { handleOperatorProductById, handleOperatorProducts } from "./routes/api-products.js";
import { handleOperatorProductMedia } from "./routes/api-product-media.js";

import {
  handlePostById,
  handlePostPublish,
  handlePostsCollection,
} from "./routes/api-posts.js";

import {
  handleTopics,
} from "./routes/api-topics.js";

import {
  handlePostGenerate,
} from "./routes/api-post-generate.js";

import {
  handleOperatorMediaById,
  handleOperatorMediaCollection,
} from "./routes/api-media.js";

import {
  handleOperatorMediaUpload,
} from "./routes/api-media-upload.js";
import { handleAppPromptsPage } from "./routes/app-prompts-page.js";
import { handleOperatorPromptReset, handleOperatorPrompts } from "./routes/api-prompts.js";

import {
  handleShortToken,
  handleTokenExchange,
  handleProfile,
} from "./routes/tokens.js";

import {
  handleLogs,
} from "./routes/logs.js";

import {
  handleAiSelectionDiagnostic,
} from "./routes/ai-selection-diagnostic.js";

import {
  handleCurrentTopicDiagnostic,
} from "./routes/current-topic-diagnostic.js";

import {
  handleCurrentTopicAutoDiagnostic,
} from "./routes/current-topic-auto-diagnostic.js";

import {
  handleCronAutoGeneralDiagnostic,
} from "./routes/cron-auto-general-diagnostic.js";

import {
  runScheduledAutoPost,
} from "./services/auto-post/scheduler.js";

export {
  VideoNormalizerContainer,
} from "./containers/video-normalizer.js";

export {
  ScheduleCoordinator,
} from "./containers/schedule-coordinator.js";

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(
        request.url
      );

    if (
      url.pathname.startsWith("/media/")
    ) {
      return handlePublicMedia(
        request,
        env,
        url
      );
    }

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

    if (pathname === "/app" && method === "GET") {
      return handleAppHome(request, env);
    }

    if (pathname === "/app/write" && method === "GET") {
      return handleAppWritePage(request, env);
    }

    if (pathname === "/app/media" && method === "GET") {
      return handleAppMediaPage(request, env);
    }

    if (pathname === "/app/products" && method === "GET") {
      return handleAppProductsPage(request, env);
    }
    if (pathname === "/app/prompts" && method === "GET") return handleAppPromptsPage(request, env);

    if (pathname === "/app/schedules" && method === "GET") {
      return handleAppSchedulesPage(request, env);
    }

    if (["/app/apps"].includes(pathname) && method === "GET") {
      return handleAppPlaceholderPage(request, env, pathname);
    }

    if (pathname === "/api/schedules") {
      return handleSchedulesCollection(request, env);
    }

    if (pathname.startsWith("/api/schedules/")) {
      const scheduleId = pathname.slice("/api/schedules/".length);
      if (!scheduleId || scheduleId.includes("/")) {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      return handleScheduleById(request, env, decodeURIComponent(scheduleId));
    }

    if (pathname === "/api/posts") {
      return handlePostsCollection(request, env, url);
    }

    if (pathname === "/api/posts/generate") {
      return handlePostGenerate(request, env);
    }

    if (pathname === "/api/topics") {
      return handleTopics(request, env);
    }

    if (pathname === "/api/topics/refresh") {
      return handleTopics(request, env);
    }

    if (pathname === "/api/media") {
      return handleOperatorMediaCollection(request, env);
    }

    if (pathname === "/api/products") {
      return handleOperatorProducts(request, env, url);
    }
    if (pathname === "/api/prompts") return handleOperatorPrompts(request, env);
    if (pathname === "/api/prompts/reset") return handleOperatorPromptReset(request, env);

    if (pathname === "/api/products/analyze") {
      return handleOperatorProductAnalyze(request, env);
    }

    if (pathname === "/api/products/media") {
      return handleOperatorProductMedia(request, env);
    }

    if (pathname.startsWith("/api/products/")) {
      const productId = pathname.slice("/api/products/".length);
      if (!productId || productId.includes("/")) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      return handleOperatorProductById(request, env, decodeURIComponent(productId));
    }

    if (pathname === "/api/media/upload") {
      return handleOperatorMediaUpload(request, env);
    }

    if (pathname.startsWith("/api/media/")) {
      const encodedMediaId = pathname.slice("/api/media/".length);
      if (!encodedMediaId || encodedMediaId.includes("/")) {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      try {
        return handleOperatorMediaById(request, env, decodeURIComponent(encodedMediaId));
      } catch {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
    }

    if (pathname.startsWith("/api/posts/") && pathname.endsWith("/publish")) {
      const encodedPostId = pathname.slice("/api/posts/".length, -"/publish".length);
      if (!encodedPostId || encodedPostId.includes("/")) {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      try {
        return handlePostPublish(request, env, decodeURIComponent(encodedPostId));
      } catch {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
    }

    if (pathname.startsWith("/api/posts/")) {
      const encodedPostId = pathname.slice("/api/posts/".length);
      if (!encodedPostId || encodedPostId.includes("/")) {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      try {
        return handlePostById(request, env, decodeURIComponent(encodedPostId));
      } catch {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
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

    if (pathname === "/admin" && method === "GET") {
      return handleAdminHomePage(request, env);
    }

    if (pathname === "/admin/endpoints" && method === "GET") {
      return handleEndpointOverviewPage(request, env);
    }

    if (
      pathname === "/admin/diagnostics/ai-selection"
    ) {
      return handleAiSelectionDiagnostic(
        request,
        env
      );
    }

    if (
      pathname === "/admin/diagnostics/current-topics" ||
      pathname === "/admin/diagnostics/current-topics/refresh"
    ) {
      return handleCurrentTopicDiagnostic(
        request,
        env
      );
    }

    if (pathname === "/admin/diagnostics/current-topic-auto") {
      return handleCurrentTopicAutoDiagnostic(request, env);
    }

    if (pathname === "/admin/diagnostics/run-cron-auto-general") {
      return handleCronAutoGeneralDiagnostic(request, env);
    }

    if (
      pathname === "/admin/products/batch" &&
      method === "POST"
    ) {
      return handleProductBatchUpload(
        request,
        env
      );
    }

    if (
      pathname === "/admin/product-review-page" &&
      method === "GET"
    ) {
      return handleProductReviewPage(
        request,
        env
      );
    }

    if (
      pathname === "/admin/product-reviews" &&
      (
        method === "GET" ||
        method === "POST"
      )
    ) {
      return handleProductReviews(
        request,
        env
      );
    }

    if (
      pathname === "/admin/media-page" &&
      method === "GET"
    ) {
      return handleMediaManagementPage(
        request,
        env
      );
    }

    if (
      pathname === "/admin/media" &&
      (
        method === "GET" ||
        method === "PATCH" ||
        method === "DELETE"
      )
    ) {
      return handleMediaLibrary(
        request,
        env,
        url
      );
    }

    if (
      pathname === "/admin/media/batch" &&
      method === "POST"
    ) {
      return handleMediaBatchUpload(
        request,
        env
      );
    }

    if (
      pathname === "/admin/content-pool" &&
      (
        method === "GET" ||
        method === "POST" ||
        method === "PATCH" ||
        method === "DELETE"
      )
    ) {
      return handleContentPool(
        request,
        env,
        url
      );
    }

    if (
      pathname === "/admin/media-inventory" &&
      method === "GET"
    ) {
      return handleWeeklyInventory(
        request,
        env,
        url
      );
    }

    if (
      pathname === "/admin/schedule-status" &&
      method === "GET"
    ) {
      return handleScheduleStatus(
        request,
        env,
        url
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
        request,
        env
      );
    }

    if (
      pathname === "/admin/exchange-token" &&
      method === "GET"
    ) {
      return handleTokenExchange(
        request,
        env
      );
    }

    if (
      pathname === "/admin/me" &&
      method === "GET"
    ) {
      return handleProfile(
        request,
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
