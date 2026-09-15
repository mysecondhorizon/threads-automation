import { logPostSuccess } from "./logger.js";
import { PublisherResolutionError } from "./publisher-resolver.js";
import { publishWithResolvedApp } from "./publish-service.js";
import { ThreadsPublisherError } from "./publishers/threads-publisher.js";
import { normalizeCommerceStoryMetadata } from "./commerce-content.js";

export class CommercePublishError extends Error {
  constructor(message, { code = "commerce_publish_failed", status = 400 } = {}) {
    super(message);
    this.name = "CommercePublishError";
    this.code = code;
    this.status = status;
  }
}

function assertInput({ opportunity, text, media }) {
  if (!opportunity?.id) {
    throw new CommercePublishError("Product Opportunity not found", {
      code: "commerce_publish_opportunity_not_found",
      status: 404,
    });
  }
  if (typeof text !== "string" || !text.trim()) {
    throw new CommercePublishError("Reviewed text is required", {
      code: "commerce_publish_text_required",
    });
  }
  if (media && media.mediaKind !== "image") {
    throw new CommercePublishError("Only linked images can be published with Commerce content", {
      code: "commerce_publish_media_unsupported",
    });
  }
}

// This is deliberately a direct manual-publish wrapper: it never calls AI,
// changes opportunity lifecycle state, or retries an external publish.
export async function publishCommerceContent(env, {
  workspaceId,
  opportunity,
  text,
  media = null,
  executionContext = null,
  storyMetadata = null,
}, dependencies = {}) {
  assertInput({ opportunity, text, media });
  const publish = dependencies.publishWithResolvedApp || publishWithResolvedApp;
  const logSuccess = dependencies.logPostSuccess || logPostSuccess;
  const mediaSelection = media
    ? { mode: "IMAGE", mediaId: media.id }
    : { mode: "TEXT", mediaId: null };
  const story = storyMetadata === null ? null : normalizeCommerceStoryMetadata(storyMetadata);
  if (storyMetadata !== null && !story) {
    throw new CommercePublishError("Commerce story metadata is invalid", {
      code: "commerce_publish_story_metadata_invalid",
    });
  }
  let published;

  try {
    published = await publish({
      env,
      targetApp: null,
      // The reviewed textarea is authoritative. Do not trim or regenerate it.
      content: text,
      format: "TEXT",
      context: { source: "COMMERCE_MANUAL", mediaSelection },
      executionContext,
      dependencies,
    });
  } catch (error) {
    if (error instanceof PublisherResolutionError || error instanceof ThreadsPublisherError) {
      throw new CommercePublishError(error.message, { code: error.code, status: error.status });
    }
    console.error("Commerce publisher adapter failed", { code: error?.code || "PUBLISH_FAILED" });
    throw new CommercePublishError("Threads publishing failed. Please try again later.", {
      code: "commerce_threads_publish_failed",
    });
  }

  // An external post is already successful even if observability storage fails.
  try {
    await logSuccess(env, published.logUsername, published.externalPostId, text, {
      workspaceId,
      source: "COMMERCE_MANUAL",
      contentMode: "commerce_manual",
      contentBasis: "PRODUCT_OPPORTUNITY",
      opportunityId: opportunity.id,
      contentAngle: story?.contentAngle || null,
      hookType: story?.hookType || null,
      usedCurrentTopic: story?.usedCurrentTopic === true,
      currentTopicId: story?.currentTopicId || null,
      usedUserExperience: story?.usedUserExperience === true,
      publishMode: mediaSelection.mode,
      mediaId: mediaSelection.mediaId,
      affiliateLinkUsed: false,
    });
  } catch {
    console.warn("Commerce publish success log failed", { opportunityId: opportunity.id });
  }

  return {
    app: published.provider,
    postId: published.externalPostId,
    mediaId: mediaSelection.mediaId,
  };
}
