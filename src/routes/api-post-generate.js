import { requireAdminApiSession } from "../middleware/auth.js";
import {
  buildCurrentTopicGenerationContext,
  readCurrentTopicInventory,
} from "../services/current-topic-inventory.js";
import { generateThreadPost, AiServiceError } from "../services/ai.js";
import { buildThreadContext } from "../services/thread-context.js";
import { composeEffectiveThreadsPrompt, getEffectivePromptProfile } from "../services/prompt-profile.js";
import { fail, ok } from "../utils/response.js";

const FORMATS = new Set(["TEXT", "HTML"]);

function invalid(message) {
  return fail(message, 400, { code: "invalid_draft_request" });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).some((key) => key !== "topicId" && key !== "format")) return null;
  const topicId = typeof value.topicId === "string" ? value.topicId.trim() : "";
  const format = value.format === undefined ? "TEXT" : value.format;
  if (!topicId || typeof format !== "string" || !FORMATS.has(format)) return null;
  return { topicId, format };
}

async function authorize(request, env) {
  const auth = await requireAdminApiSession(request, env);
  return auth.ok ? null : auth.response;
}

function buildOperatorGenerationGoal(topic, format) {
  return [
    topic.subject,
    `Write the post body as ${format} source text for the operator's selected format.`,
    "Return only the post body without an explanation or title.",
  ].join("\n");
}

export async function handlePostGenerate(request, env, {
  readInventory = readCurrentTopicInventory,
  buildContext = buildThreadContext,
  buildTopicContext = buildCurrentTopicGenerationContext,
  generatePost = generateThreadPost,
  getProfile = getEffectivePromptProfile,
} = {}) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);

  const options = parseRequest(await readJson(request));
  if (!options) return invalid("topicId and format are required and invalid values are not allowed");

  try {
    const inventory = await readInventory(env);
    const topic = (Array.isArray(inventory?.topics) ? inventory.topics : [])
      .find((item) => item?.id === options.topicId);
    if (!topic) {
      return fail("Topic not found", 404, { code: "topic_not_found" });
    }
    const currentTopic = buildTopicContext(topic);
    if (!currentTopic) {
      return fail("Topic not found", 404, { code: "topic_not_found" });
    }

    const context = await buildContext(env);
    context.publishing = {
      ...context.publishing,
      goal: buildOperatorGenerationGoal(topic, options.format),
    };
    context.currentTopic = currentTopic;
    const effectiveProfile = await getProfile(env);
    const generated = await generatePost(env, context, { systemPrompt: composeEffectiveThreadsPrompt(effectiveProfile.profile) });
    const body = String(generated?.body || "").trim();
    if (!body) {
      throw new AiServiceError("AI generated an empty draft");
    }

    return ok({
      draft: {
        title: null,
        body,
        format: options.format,
        sourceType: "AI",
        topicId: topic.id,
      },
    });
  } catch (error) {
    if (error instanceof AiServiceError) {
      console.error("Operator draft generation failed", { message: error.message });
      return fail("AI draft generation failed", 502, { code: "ai_draft_generation_failed" });
    }
    console.error("Operator draft context failed", { code: error?.code || "operator_draft_error" });
    return fail("Draft generation failed", 502, { code: error?.code || "operator_draft_error" });
  }
}
