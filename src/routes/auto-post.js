import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  buildThreadContext,
} from "../services/thread-context.js";

import {
  generateThreadPost,
  AiServiceError,
} from "../services/ai.js";

import {
  getThreadsProfile,
  publishTextPost,
  ThreadsApiError,
} from "../services/threads.js";

import {
  getJson,
} from "../services/kv.js";

import {
  logPostSuccess,
  logPostFailure,
} from "../services/logger.js";

import {
  ok,
  fail,
} from "../utils/response.js";

export async function handleAutoPost(
  request,
  env
) {
  const adminAuth =
    await requireAdminApiSession(
      request,
      env
    );

  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  const threadsAuth =
    await getJson(
      env,
      "threads_auth"
    );

  if (!threadsAuth?.access_token) {
    return fail(
      "Threads 연결 정보가 없습니다.",
      400
    );
  }

  let context = null;
  let generatedPost = null;

  try {
    context =
      await buildThreadContext(
        env
      );

    context.publishing.goal =
      "현재 시간과 최근 게시 성과를 반영한 Threads 게시글 1개를 작성한다.";

    context.publishing.requestedTone =
      "40대 직장인의 현실적인 말투";

    generatedPost =
      await generateThreadPost(
        env,
        context
      );

    const text = String(
      generatedPost.body || ""
    ).trim();

    if (!text) {
      return fail(
        "AI가 게시글을 생성하지 못했습니다.",
        502
      );
    }

    if (text.length > 500) {
      return fail(
        "AI가 생성한 본문이 500자를 초과했습니다.",
        502,
        {
          length: text.length,
        }
      );
    }

    const profile =
      await getThreadsProfile(
        threadsAuth.access_token
      );
      
    const publishResult =
      await publishTextPost(
        threadsAuth.access_token,
        profile.id,
        text
      );

    await logPostSuccess(
      env,
      profile.username,
      publishResult.postId,
      text
    );

    return ok({
      username:
        profile.username,

      post_id:
        publishResult.postId,

      text,

      postType:
        generatedPost.postType,

      firstComment:
        generatedPost.firstComment,

      metadata:
        generatedPost.metadata,

      context: {
        version:
          context.meta.version,

        generatedAt:
          context.meta.generatedAt,

        publishSequence:
          context.publishing
            .publishSequence,

        recentPostCount:
          context.history
            .recentPostCount,

        performanceLevel:
          context.analytics
            .performanceLevel,
      },
    });
  } catch (error) {
    const failedText =
      generatedPost?.body || "";

    if (
      error instanceof
      AiServiceError
    ) {
      console.error(
        "Auto post AI generation failed",
        {
          message:
            error.message,
          details:
            error.details,
        }
      );

      await logPostFailure(
        env,
        "ai_generation",
        failedText,
        error.details || {
          message:
            error.message,
        }
      );

      return fail(
        "자동 게시용 AI 글 생성에 실패했습니다.",
        502,
        {
          reason:
            error.message,
        }
      );
    }

    if (
      error instanceof
      ThreadsApiError
    ) {
      console.error(
        "Auto post Threads publish failed",
        {
          step:
            error.step,
          details:
            error.details,
        }
      );

      await logPostFailure(
        env,
        error.step,
        failedText,
        error.details
      );

      return fail(
        "자동 Threads 게시에 실패했습니다.",
        400,
        {
          step:
            error.step,
          details:
            error.details,
        }
      );
    }

    console.error(
      "Unexpected auto post error",
      error
    );

    await logPostFailure(
      env,
      "unexpected_auto_post_error",
      failedText,
      {
        message:
          error instanceof Error
            ? error.message
            : String(error),
      }
    );

    return fail(
      "Unexpected server error",
      500
    );
  }
}