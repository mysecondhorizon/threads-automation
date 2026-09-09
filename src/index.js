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
  handleMediaManagementPage,
} from "./routes/media-management-page.js";

import {
  handleMediaLibrary,
  handleMediaBatchUpload,
  handleContentPool,
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
  handleConnectedAccountOAuthStart,
} from "./routes/oauth.js";

import {
  handleAdminLoginPage,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminPostPage,
  handleAdminPost,
} from "./routes/admin.js";
import {
  handleAdminHomePage,
  handleEndpointOverviewPage,
} from "./routes/admin-overview.js";

import {
  handleAppHome,
  handleAppWorkspaceSelection,
  renderAppWorkspaceUnavailable,
} from "./routes/app-shell.js";
import {
  handleAppLogin,
  handleAppLoginPage,
  handleAppLogout,
} from "./routes/app-auth.js";
import { resolveCurrentSession } from "./middleware/auth.js";
import {
  isUnscopedAppAccessBlocked,
  resolveCurrentAppContext,
} from "./services/app-context.js";
import { handleAppAppsPage } from "./routes/app-apps-page.js";
import { handleAppById, handleAppsCollection } from "./routes/api-apps.js";

import {
  handleAppSchedulesPage,
} from "./routes/app-schedules-page.js";

import {
  handleScheduleById,
  handleSchedulesCollection,
  handleScheduleReconcile,
} from "./routes/api-schedules.js";

import {
  handleAppWritePage,
} from "./routes/app-write-page.js";

import {
  handleAppDailyPage,
  handleAppMediaPage,
} from "./routes/app-media-page.js";
import { handleAppProductsPage } from "./routes/app-products-page.js";

import { handleOperatorProductMedia } from "./routes/api-product-media.js";
import {
  handleProductOpportunityById,
  handleProductOpportunityProductCandidates,
  handleProductOpportunityDiscovery,
  handleProductOpportunitiesCollection,
} from "./routes/api-product-opportunities.js";

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
import { handleAppActivityPage } from "./routes/app-activity-page.js";
import { handleOperatorPromptReset, handleOperatorPrompts } from "./routes/api-prompts.js";
import { handleOperatorActivity } from "./routes/api-activity.js";

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

import { handleLegacyScheduledExecution } from "./services/legacy-scheduled-execution.js";
import { reconcileRuntimeScheduleAlarm } from "./services/runtime-schedules.js";

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
        request,
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
      pathname === "/admin/logout" &&
      method === "POST"
    ) {
      return handleAdminLogout(request, env);
    }

    if (pathname === "/app" && method === "GET") {
      return handleAppHome(request, env);
    }

    if (pathname === "/app/login" && method === "GET") {
      return handleAppLoginPage();
    }

    if (pathname === "/app/login" && method === "POST") {
      return handleAppLogin(request, env);
    }

    if (pathname === "/app/logout" && method === "POST") {
      return handleAppLogout(request, env);
    }

    if (pathname === "/app/workspace" && method === "POST") {
      return handleAppWorkspaceSelection(request, env);
    }

    if (
      pathname === "/app/connected-accounts/threads/start" &&
      method === "POST"
    ) {
      return handleConnectedAccountOAuthStart(request, env);
    }

    if (
      (pathname === "/app" || pathname.startsWith("/app/")) &&
      method === "GET" &&
      !await resolveCurrentSession(request, env)
    ) {
      return Response.redirect(new URL("/app/login", request.url).toString(), 302);
    }

    if (pathname.startsWith("/app/") && method === "GET") {
      const appContext = await resolveCurrentAppContext(request, env);
      if (
        isUnscopedAppAccessBlocked(appContext) &&
        pathname !== "/app/daily" &&
        pathname !== "/app/media" &&
        pathname !== "/app/products" &&
        pathname !== "/app/prompts" &&
        pathname !== "/app/write" &&
        pathname !== "/app/activity" &&
        pathname !== "/app/schedules"
      ) {
        return renderAppWorkspaceUnavailable(appContext, pathname);
      }
    }

    if (pathname === "/app/write" && method === "GET") {
      return handleAppWritePage(request, env);
    }

    if (pathname === "/app/daily" && method === "GET") {
      return handleAppDailyPage(request, env);
    }

    if (pathname === "/app/media" && method === "GET") {
      return handleAppMediaPage(request, env);
    }

    if (pathname === "/app/products" && method === "GET") {
      return handleAppProductsPage(request, env);
    }

    if (pathname === "/app/prompts" && method === "GET") return handleAppPromptsPage(request, env);

    if (pathname === "/app/activity" && method === "GET") {
      return handleAppActivityPage(request, env);
    }

    if (pathname === "/app/schedules" && method === "GET") {
      return handleAppSchedulesPage(request, env);
    }

    if (pathname === "/app/apps" && method === "GET") {
      return handleAppAppsPage(request, env);
    }

    if (pathname === "/api/apps") {
      return handleAppsCollection(request, env);
    }

    if (pathname.startsWith("/api/apps/")) {
      const appId = pathname.slice("/api/apps/".length);
      if (!appId || appId.includes("/")) {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      try {
        return handleAppById(request, env, decodeURIComponent(appId));
      } catch {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
    }

    if (pathname === "/api/schedules") {
      return handleSchedulesCollection(request, env);
    }

    if (pathname === "/api/schedules/reconcile") {
      return handleScheduleReconcile(request, env);
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

    if (pathname === "/api/prompts") return handleOperatorPrompts(request, env);
    if (pathname === "/api/prompts/reset") return handleOperatorPromptReset(request, env);
    if (pathname === "/api/activity") return handleOperatorActivity(request, env, url);

    if (pathname === "/api/products/media") {
      return handleOperatorProductMedia(request, env);
    }

    if (pathname === "/api/product-opportunities") {
      return handleProductOpportunitiesCollection(request, env);
    }

    if (pathname === "/api/product-opportunities/discover") {
      return handleProductOpportunityDiscovery(request, env);
    }

    if (pathname.startsWith("/api/product-opportunities/") && pathname.endsWith("/product-candidates")) {
      const opportunityId = pathname.slice("/api/product-opportunities/".length, -"/product-candidates".length);
      if (!opportunityId || opportunityId.includes("/")) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      return handleProductOpportunityProductCandidates(request, env, decodeURIComponent(opportunityId));
    }

    if (pathname.startsWith("/api/product-opportunities/") && pathname.endsWith("/assets/candidates")) {
      const opportunityId = pathname.slice("/api/product-opportunities/".length, -"/assets/candidates".length);
      if (!opportunityId || opportunityId.includes("/")) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      return handleProductOpportunityAssets(request, env, decodeURIComponent(opportunityId), "candidates");
    }

    if (pathname.startsWith("/api/product-opportunities/") && pathname.endsWith("/assets")) {
      const opportunityId = pathname.slice("/api/product-opportunities/".length, -"/assets".length);
      if (!opportunityId || opportunityId.includes("/")) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      return handleProductOpportunityAssets(request, env, decodeURIComponent(opportunityId));
    }

    if (pathname.startsWith("/api/product-opportunities/") && pathname.includes("/assets/")) {
      const parts = pathname.slice("/api/product-opportunities/".length).split("/assets/");
      if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0].includes("/") || parts[1].includes("/")) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      return handleProductOpportunityAssets(request, env, decodeURIComponent(parts[0]), decodeURIComponent(parts[1]));
    }

    if (pathname.startsWith("/api/product-opportunities/")) {
      const opportunityId = pathname.slice("/api/product-opportunities/".length);
      if (!opportunityId || opportunityId.includes("/")) {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      try {
        return handleProductOpportunityById(request, env, decodeURIComponent(opportunityId));
      } catch {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
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
      handleLegacyScheduledExecution(env, controller)
    );
    // Legacy Cron business execution remains untouched. This only wakes the
    // existing coordinator so workspace-scoped schedules are discovered and
    // their own Durable Object alarm is maintained.
    ctx.waitUntil(
      reconcileRuntimeScheduleAlarm(env).catch((error) => {
        console.error("Workspace schedule alarm reconciliation failed", {
          message: String(error?.message || "runtime_schedule_reconcile_failed").slice(0, 256),
        });
      })
    );
  },
};
