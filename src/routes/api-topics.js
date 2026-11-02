import { requireAdminApiSession } from "../middleware/auth.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
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
  const auth = await requireAdminApiSession(request, env, { allowSelectedWorkspace: true });
  if (!auth.ok) return auth.response;
  // This inventory belongs to the existing default runtime. A platform grant
  // or ownership of a different workspace must not confer access to it.
  if (!auth.session.legacy && auth.workspaceId !== DEFAULT_WORKSPACE_ID) {
    return fail("Topic access is not available for this workspace", 409);
  }
  if (!auth.session.legacy && request.method === "POST" &&
      request.headers.get("origin") !== new URL(request.url).origin) {
    return fail("Forbidden", 403);
  }
  return null;
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
