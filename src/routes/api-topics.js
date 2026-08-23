import { requireAdminApiSession } from "../middleware/auth.js";
import {
  readCurrentTopicInventory,
  refreshCurrentTopicInventory,
} from "../services/current-topic-inventory.js";
import { fail, ok } from "../utils/response.js";

function toOperatorTopic(topic, inventory) {
  const summary = String(
    topic?.personaRelevance ||
    topic?.talkingPoints?.[0] ||
    topic?.verifiedFacts?.[0] ||
    ""
  ).trim();

  return {
    id: String(topic?.id || ""),
    title: String(topic?.subject || "").trim(),
    summary,
    updatedAt: topic?.capturedAt || inventory?.capturedAt || null,
  };
}

function operatorTopics(inventory) {
  return (Array.isArray(inventory?.topics) ? inventory.topics : [])
    .map((topic) => toOperatorTopic(topic, inventory))
    .filter((topic) => topic.id && topic.title);
}

async function authorize(request, env) {
  const auth = await requireAdminApiSession(request, env);
  return auth.ok ? null : auth.response;
}

function topicError(error, fallback) {
  console.error(fallback, { code: error?.code || "topic_inventory_error" });
  return fail(fallback, 502, { code: error?.code || "topic_inventory_error" });
}

export async function handleTopics(request, env, {
  readInventory = readCurrentTopicInventory,
  refreshInventory = refreshCurrentTopicInventory,
} = {}) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;

  try {
    if (request.method === "GET") {
      const inventory = await readInventory(env);
      return ok({ topics: operatorTopics(inventory) });
    }
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/api/topics/refresh"
    ) {
      await refreshInventory(env);
      const inventory = await readInventory(env);
      return ok({ topics: operatorTopics(inventory) });
    }
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return topicError(error, request.method === "POST"
      ? "Topic refresh failed"
      : "Topic lookup failed");
  }
}
