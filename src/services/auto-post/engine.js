import {
  buildThreadContext,
} from "../thread-context.js";

import {
  AiServiceError,
} from "../ai.js";

import {
  ThreadsApiError,
} from "../threads.js";

import {
  getJson,
} from "../kv.js";

import {
  logPostFailure,
} from "../logger.js";

import {
  AutoPostValidationError,
  validateAutoPostPolicy,
} from "../auto-post-validator.js";

import {
  PostSimilarityError,
} from "../post-similarity.js";

import {
  generateDistinctThreadPost,
  SAFE_FORMAT_DIVERSITY_OPTIONS,
} from "../post-regenerator.js";

import {
  resolveCurrentTopicGeneration,
} from "../current-topic-inventory.js";

import {
  AutoPostEngineError,
  serializeAutoPostError,
} from "./errors.js";

import {
  saveExecution,
  updateExecution,
} from "./execution-store.js";

import {
  acquireExecutionLock,
  releaseExecutionLock,
} from "./lock.js";

import {
  publishAutoPost,
  publishGeneralAutoPost,
} from "./publisher.js";

import {
  selectGeneralAutoMedia,
} from "../general-auto-media-selection.js";

export {
  getAutoPostStatus,
} from "./status.js";

export {
  AutoPostEngineError,
} from "./errors.js";

const AUTO_POST_GOAL =
  "현재 시간과 최근 게시 성과를 반영한 Threads 게시글 1개를 작성한다.";

const AUTO_POST_TONE =
  "30대 중후반 직장인의 담백하고 현실적인 말투";

const SIMILARITY_THRESHOLD =
  0.62;

const MAX_SIMILARITY_POSTS =
  20;

const MAX_GENERATION_ATTEMPTS =
  2;

const ALLOWED_EXECUTION_SOURCES =
  new Set([
    "manual",
    "cron",
    "cron_auto_general",
  ]);

const PRODUCT_CONTENT_TYPES =
  new Set([
    "제품 발견형",
    "제품 경험형",
    "제품 연결형",
  ]);

let activeExecutionPromise =
  null;

function normalizeExecutionSource(
  source
) {
  const normalized =
    String(
      source || ""
    ).trim();

  if (
    ALLOWED_EXECUTION_SOURCES.has(
      normalized
    )
  ) {
    return normalized;
  }

  return "manual";
}

export function enforceGeneralAutoPolicy(generatedPost) {
  const violations = [];
  if (PRODUCT_CONTENT_TYPES.has(String(generatedPost?.contentType || "").trim())) {
    violations.push("contentType");
  }
  if (generatedPost?.productConnected === true) violations.push("productConnected");
  if (generatedPost?.affiliateLinkUsed === true) violations.push("affiliateLinkUsed");
  if (generatedPost?.affiliateDisclosureRequired === true) {
    violations.push("affiliateDisclosureRequired");
  }
  if (String(generatedPost?.productId || "").trim()) violations.push("productId");
  if (violations.length) {
    throw new AutoPostValidationError(
      "General AUTO slots cannot publish product-connected content.",
      {
        code: "general_auto_product_content_forbidden",
        details: { violations },
      }
    );
  }
  return true;
}

export function applyGeneralAutoContext(context) {
  context.publishing.goal = [
    AUTO_POST_GOAL,
    "Generate only general, relatable, or practical daily-life content.",
    "Do not select product discovery, product experience, or product-connected content.",
  ].join(" ");
  context.publishing.productConnectedAvailable = false;
  context.publishing.affiliateLinkAvailable = false;
  context.publishing.linkAvailable = false;
  context.products = {
    ...context.products,
    availableProducts: [],
    productExperience: [],
    productDetails: [],
    productPrices: [],
    productPhotos: [],
  };
  return context;
}

export function getRecentCronAutoTopicIds(context) {
  const topicIds = new Set();
  const recentPosts = Array.isArray(context?.history?.recentSevenDayPosts)
    ? context.history.recentSevenDayPosts
    : [];

  for (const post of recentPosts) {
    if (post?.source !== "cron_auto_general") continue;
    const topicId = String(post?.currentTopicId || "").trim();
    if (topicId) topicIds.add(topicId);
  }

  return [...topicIds];
}

export function shouldAttemptCurrentTopicForGeneralAuto(context, { source, generalOnly } = {}) {
  if (!generalOnly || source !== "cron_auto_general") return false;

  const recentPosts = Array.isArray(context?.history?.recentSevenDayPosts)
    ? context.history.recentSevenDayPosts
    : [];
  const latestCronAutoPost = recentPosts.find(
    (post) => post?.source === "cron_auto_general"
  );

  return latestCronAutoPost?.contentMode !== "current_topic_reaction";
}

export async function resolveCurrentTopicForGeneralAuto(
  env,
  context,
  {
    source,
    generalOnly,
    resolveGeneration = resolveCurrentTopicGeneration,
  } = {}
) {
  const recentPosts = Array.isArray(context?.history?.recentSevenDayPosts)
    ? context.history.recentSevenDayPosts
    : [];
  const latestCronAutoPost = recentPosts.find(
    (post) => post?.source === "cron_auto_general"
  );
  const lastSuccessfulCronContentMode = latestCronAutoPost?.contentMode || null;
  const recentTopicIds = getRecentCronAutoTopicIds(context);

  if (!shouldAttemptCurrentTopicForGeneralAuto(context, { source, generalOnly })) {
    return {
      currentTopic: null,
      nextContentMode: "everyday_personal",
      cadence: { lastSuccessfulCronContentMode, reason: "last_successful_cron_current_topic" },
      recentTopicIds,
      inventoryAvailable: null,
      eligibleTopicCount: 0,
      fallbackReason: null,
    };
  }

  try {
    const result = await resolveGeneration(env, { recentTopicIds });
    const inventoryAvailable = Array.isArray(result?.inventory?.topics)
      ? result.inventory.topics.length > 0
      : false;
    const eligibleTopicCount = Array.isArray(result?.eligibleTopics)
      ? result.eligibleTopics.length
      : 0;

    if (result?.currentTopic) {
      return {
        currentTopic: result.currentTopic,
        nextContentMode: "current_topic_reaction",
        cadence: { lastSuccessfulCronContentMode, reason: "current_topic_slot" },
        recentTopicIds,
        inventoryAvailable,
        eligibleTopicCount,
        fallbackReason: null,
      };
    }

    return {
      currentTopic: null,
      nextContentMode: "everyday_personal",
      cadence: { lastSuccessfulCronContentMode, reason: "current_topic_slot" },
      recentTopicIds,
      inventoryAvailable,
      eligibleTopicCount,
      fallbackReason: "no_eligible_current_topic",
    };
  } catch (error) {
    return {
      currentTopic: null,
      nextContentMode: "everyday_personal",
      cadence: { lastSuccessfulCronContentMode, reason: "current_topic_slot" },
      recentTopicIds,
      inventoryAvailable: null,
      eligibleTopicCount: 0,
      fallbackReason: error?.code || "current_topic_unavailable",
    };
  }
}

async function applyCurrentTopicForGeneralAuto(env, context, options = {}) {
  const decision = await resolveCurrentTopicForGeneralAuto(env, context, options);
  if (decision.currentTopic) context.currentTopic = decision.currentTopic;
  if (decision.fallbackReason) {
    console.warn("Current topic AUTO fallback", { code: decision.fallbackReason });
  }
  return decision.currentTopic;
}

function buildGeneralAutoContentMetadata(context) {
  const currentTopic = context?.currentTopic;
  if (!currentTopic) {
    return { contentMode: "everyday_personal" };
  }

  return {
    contentMode: "current_topic_reaction",
    currentTopicId: currentTopic.topicId,
    currentTopicCategory: currentTopic.category,
    currentTopicSelectedAngle: currentTopic.selectedAngle,
  };
}

function textMediaSelection(reason = null) {
  return {
    mode: "TEXT",
    mediaId: null,
    contentPoolId: null,
    reason,
  };
}

function shouldSelectGeneralAutoMedia(source, generalOnly) {
  return source === "cron_auto_general" && generalOnly === true;
}

function createExecutionId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto
      .randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 12),
  ].join("-");
}

function createExecution(
  executionId,
  source
) {
  const now =
    new Date().toISOString();

  return {
    id:
      executionId,

    source,

    status:
      "starting",

    step:
      "initializing",

    startedAt:
      now,

    updatedAt:
      now,

    completedAt:
      null,

    postId:
      null,

    username:
      null,

    textLength:
      null,

    generation: {
      attempts:
        0,

      regenerated:
        false,
    },

    similarity: {
      checkedPostCount:
        0,

      threshold:
        SIMILARITY_THRESHOLD,

      highestScore:
        0,

      matchedPostId:
        null,
    },

    firstComment: {
      requested:
        false,

      published:
        false,

      replyId:
        null,

      error:
        null,
    },

    error:
      null,
  };
}

async function safeLogFailure(
  env,
  step,
  text,
  details
) {
  try {
    await logPostFailure(
      env,
      step,
      text,
      details
    );
  } catch (
    logError
  ) {
    console.error(
      "Auto post failure logging failed",
      logError
    );
  }
}

function normalizeEngineError(
  error,
  generatedPost
) {
  const failedText =
    String(
      generatedPost?.body || ""
    );

  if (
    error instanceof
    AutoPostEngineError
  ) {
    if (!error.text) {
      error.text =
        failedText;
    }

    return error;
  }

  if (
    error instanceof
    PostSimilarityError
  ) {
    return new AutoPostEngineError(
      error.message,
      {
        code:
          error.code,

        status:
          409,

        step:
          "similarity_validation",

        details:
          error.details,

        text:
          failedText,

        cause:
          error,
      }
    );
  }

  if (
    error instanceof
    AutoPostValidationError
  ) {
    return new AutoPostEngineError(
      error.message,
      {
        code:
          error.code,

        status:
          502,

        step:
          "validation",

        details:
          error.details,

        text:
          failedText,

        cause:
          error,
      }
    );
  }

  if (
    error instanceof
    AiServiceError
  ) {
    return new AutoPostEngineError(
      "자동 게시용 AI 글 생성에 실패했습니다.",
      {
        code:
          "ai_generation_failed",

        status:
          502,

        step:
          "ai_generation",

        details:
          error.details || {
            message:
              error.message,
          },

        text:
          failedText,

        cause:
          error,
      }
    );
  }

  if (
    error instanceof
    ThreadsApiError
  ) {
    return new AutoPostEngineError(
      "자동 Threads 게시에 실패했습니다.",
      {
        code:
          "threads_publish_failed",

        status:
          400,

        step:
          error.step,

        details:
          error.details,

        text:
          failedText,

        cause:
          error,
      }
    );
  }

  return new AutoPostEngineError(
    "Unexpected server error",
    {
      code:
        "unexpected_auto_post_error",

      status:
        500,

      step:
        "unexpected_auto_post_error",

      details:
        serializeAutoPostError(
          error
        ),

      text:
        failedText,

      cause:
        error instanceof Error
          ? error
          : null,
    }
  );
}

function normalizeFirstCommentResult(
  generatedPost,
  firstCommentResult
) {
  const requestedText =
    String(
      generatedPost?.firstComment || ""
    ).trim();

  return {
    requested:
      Boolean(
        requestedText
      ),

    published:
      Boolean(
        firstCommentResult?.published
      ),

    replyId:
      firstCommentResult?.replyId ||
      null,

    text:
      firstCommentResult?.text ||
      requestedText ||
      "",

    error:
      firstCommentResult?.error ||
      null,
  };
}

function buildSimilarityResult(
  similarity
) {
  return {
    checkedPostCount:
      similarity.checkedPostCount,

    threshold:
      similarity.threshold,

    highestScore:
      Number(
        similarity.highestScore
          .toFixed(4)
      ),

    matchedPostId:
      similarity.highestMatch
        ?.postId ||
      null,
  };
}

function buildGenerationResult(
  generation
) {
  return {
    attempts:
      generation.attempts,

    regenerated:
      generation.regenerated,

    formatSignature:
      generation.format
        ?.signature ||
      null,

    targetFormatId:
      generation.targetFormat
        ?.id ||
      null,
  };
}

function buildSuccessResult(
  executionId,
  source,
  profile,
  publishResult,
  generatedPost,
  context,
  validation,
  similarity,
  generation,
  firstCommentResult,
  mediaSelection,
  trackingWarnings
) {
  return {
    executionId,

    source,

    username:
      profile.username,

    post_id:
      publishResult.postId,

    text:
      validation.text,

    postType:
      generatedPost.postType,

    contentType:
      generatedPost
        .contentType,

    topic:
      generatedPost
        .topic,

    emotion:
      generatedPost
        .emotion,

    hookStyle:
      generatedPost
        .hookStyle,

    endingStyle:
      generatedPost
        .endingStyle,

    questionUsed:
      generatedPost
        .questionUsed,

    productId:
      generatedPost
        .productId,

    productConnected:
      generatedPost
        .productConnected,

    publishMode:
      mediaSelection?.mode ||
      "TEXT",

    mediaId:
      mediaSelection?.mediaId ||
      null,

    contentPoolId:
      mediaSelection?.contentPoolId ||
      null,

    mediaSelectionReason:
      mediaSelection?.reason ||
      null,

    trackingWarnings:
      Array.isArray(trackingWarnings)
        ? trackingWarnings
        : [],

    affiliateLinkUsed:
      generatedPost
        .affiliateLinkUsed,

    affiliateDisclosureRequired:
      generatedPost
        .affiliateDisclosureRequired,

    firstComment:
      normalizeFirstCommentResult(
        generatedPost,
        firstCommentResult
      ),

    validation: {
      length:
        validation.length,

      maxLength:
        validation.maxLength,
    },

    generation:
      buildGenerationResult(
        generation
      ),

    similarity:
      buildSimilarityResult(
        similarity
      ),

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
  };
}

async function runExecution(
  env,
  source,
  { generalOnly = false } = {}
) {
  const executionId =
    createExecutionId();

  const execution =
    createExecution(
      executionId,
      source
    );

  let lockAcquired =
    false;

  let generatedPost =
    null;

  let mainPublished =
    false;

  await saveExecution(
    env,
    executionId,
    execution
  );

  try {
    await acquireExecutionLock(
      env,
      executionId
    );

    lockAcquired =
      true;

    await updateExecution(
      env,
      execution,
      {
        status:
          "running",

        step:
          "loading_auth",
      }
    );

    const threadsAuth =
      await getJson(
        env,
        "threads_auth"
      );

    if (
      !threadsAuth?.access_token
    ) {
      throw new AutoPostEngineError(
        "Threads 연결 정보가 없습니다.",
        {
          code:
            "threads_auth_missing",

          status:
            400,

          step:
            "loading_auth",
        }
      );
    }

    await updateExecution(
      env,
      execution,
      {
        step:
          "building_context",
      }
    );

    const context =
      await buildThreadContext(
        env
      );

    context.publishing.goal =
      AUTO_POST_GOAL;

    context.publishing.requestedTone =
      AUTO_POST_TONE;

    if (generalOnly) {
      applyGeneralAutoContext(
        context
      );

      await applyCurrentTopicForGeneralAuto(
        env,
        context,
        { source, generalOnly }
      );
    }

    await updateExecution(
      env,
      execution,
      {
        step:
          "generating_content",
      }
    );

    const generation =
      await generateDistinctThreadPost(
        env,
        context,
        {
          threshold:
            SIMILARITY_THRESHOLD,

          maxRecentPosts:
            MAX_SIMILARITY_POSTS,

          maxAttempts:
            MAX_GENERATION_ATTEMPTS,

          ...SAFE_FORMAT_DIVERSITY_OPTIONS,
        }
      );

    generatedPost =
      generation.generatedPost;

    if (generalOnly) {
      validateAutoPostPolicy(
        generatedPost,
        context
      );

      enforceGeneralAutoPolicy(
        generatedPost
      );
    }

    let mediaSelection =
      textMediaSelection();

    if (
      shouldSelectGeneralAutoMedia(
        source,
        generalOnly
      )
    ) {
      try {
        mediaSelection =
          await selectGeneralAutoMedia(
            env,
            {
              generatedPost,
              currentTopic:
                context.currentTopic ||
                null,
            }
          );
      } catch (error) {
        console.warn(
          "General AUTO media selection unavailable",
          {
            category:
              "media_selection_unavailable",
          }
        );

        mediaSelection =
          textMediaSelection(
            "media_selection_unavailable"
          );
      }
    }

    const validation =
      generation.validation;

    const similarity =
      generation.similarity;

    const generationResult =
      buildGenerationResult(
        generation
      );

    const similarityResult =
      buildSimilarityResult(
        similarity
      );

    await updateExecution(
      env,
      execution,
      {
        step:
          "publishing",

        textLength:
          validation.length,

        generation:
          generationResult,

        similarity:
          similarityResult,

        firstComment: {
          requested:
            Boolean(
              String(
                generatedPost
                  ?.firstComment ||
                ""
              ).trim()
            ),

          published:
            false,

          replyId:
            null,

          error:
            null,
        },
      }
    );

    const {
      profile,
      publishResult,
      firstCommentResult,
      mediaSelection: publishedMediaSelection,
      trackingWarnings,
    } = await (
      generalOnly
        ? publishGeneralAutoPost
        : publishAutoPost
    )(
      env,
      {
        accessToken:
          threadsAuth.access_token,

        text:
          validation.text,

        firstComment:
          generatedPost
            ?.firstComment ||
          "",

        mediaSelection,

        metadata: {
          source,

          style:
            generatedPost
              ?.postType ||
            null,

          contentType:
            generatedPost
              ?.contentType ||
            null,

          topic:
            generatedPost
              ?.topic ||
            null,

          emotion:
            generatedPost
              ?.emotion ||
            null,

          hookStyle:
            generatedPost
              ?.hookStyle ||
            null,

          endingStyle:
            generatedPost
              ?.endingStyle ||
            null,

          questionUsed:
            Boolean(
              generatedPost
                ?.questionUsed
            ),

          productId:
            generatedPost
              ?.productId ||
            null,

          productConnected:
            Boolean(
              generatedPost
                ?.productConnected
            ),

          affiliateLinkUsed:
            Boolean(
              generatedPost
                ?.affiliateLinkUsed
            ),

          affiliateDisclosureRequired:
            Boolean(
              generatedPost
                ?.affiliateDisclosureRequired
            ),

          publishMode:
            mediaSelection.mode,

          mediaId:
            mediaSelection.mediaId,

          contentPoolId:
            mediaSelection.contentPoolId,

          ...(generalOnly
            ? buildGeneralAutoContentMetadata(context)
            : {}),
        },
      }
    );

    mainPublished =
      true;

    const normalizedFirstComment =
      normalizeFirstCommentResult(
        generatedPost,
        firstCommentResult
      );

    try {
      await updateExecution(
        env,
        execution,
        {
          status:
            "completed",

          step:
            "completed",

          completedAt:
            new Date().toISOString(),

          postId:
            publishResult.postId,

          username:
            profile.username,

          textLength:
            validation.length,

          generation:
            generationResult,

          similarity:
            similarityResult,

          firstComment:
            normalizedFirstComment,

          error:
            null,
        }
      );
    } catch (error) {
      if (mainPublished) {
        console.warn(
          "Auto post completion tracking failed",
          {
            executionId,

            source,

            postId:
              publishResult.postId,

            category:
              "execution_completion_update_failed",
          }
        );
      }
    }

    return buildSuccessResult(
      executionId,
      source,
      profile,
      publishResult,
      generatedPost,
      context,
      validation,
      similarity,
      generation,
      firstCommentResult,
      publishedMediaSelection,
      trackingWarnings
    );
  } catch (
    error
  ) {
    const engineError =
      normalizeEngineError(
        error,
        generatedPost
      );

    console.error(
      "Auto post execution failed",
      {
        executionId,

        source,

        code:
          engineError.code,

        step:
          engineError.step,

        message:
          engineError.message,

        details:
          engineError.details,
      }
    );

    await safeLogFailure(
      env,
      engineError.step,
      engineError.text,
      engineError.details || {
        message:
          engineError.message,
      }
    );

    await updateExecution(
      env,
      execution,
      {
        status:
          "failed",

        step:
          engineError.step,

        completedAt:
          new Date().toISOString(),

        error: {
          code:
            engineError.code,

          message:
            engineError.message,

          details:
            engineError.details,
        },
      }
    );

    throw engineError;
  } finally {
    if (
      lockAcquired
    ) {
      try {
        await releaseExecutionLock(
          env,
          executionId
        );
      } catch (
        releaseError
      ) {
        console.error(
          "Auto post lock release failed",
          {
            executionId,

            source,

            error:
              serializeAutoPostError(
                releaseError
              ),
          }
        );
      }
    }
  }
}

export async function executeAutoPost(
  env,
  {
    source = "manual",
    generalOnly = false,
  } = {}
) {
  const executionSource =
    normalizeExecutionSource(
      source
    );

  if (
    activeExecutionPromise
  ) {
    throw new AutoPostEngineError(
      "자동 게시가 이미 실행 중입니다.",
      {
        code:
          "auto_post_in_progress",

        status:
          409,

        step:
          "lock",

        details: {
          source:
            executionSource,
        },
      }
    );
  }

  activeExecutionPromise =
    runExecution(
      env,
      executionSource,
      { generalOnly }
    );

  try {
    return await activeExecutionPromise;
  } finally {
    activeExecutionPromise =
      null;
  }
}
