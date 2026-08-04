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

  const threadsAuth = await getJson(
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
      await buildThreadContext(env);

    context.publishing.goal =
      "현재 시간대와 최근 게시 이력, 성과 데이터를 바탕으로 가장 적절한 글 1개를 작성한다.";

    context.publishing.requestedTone =
      "40대 평범한 직장인의 현실적이고 자연스러운 말투";

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
        "AI가 게시할 본문을 생성하지 못했습니다.",
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

    const publishResult