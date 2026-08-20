import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  readCurrentTopicInventory,
  refreshCurrentTopicInventory,
  selectCurrentTopic,
} from "../services/current-topic-inventory.js";

import {
  ok,
  fail,
} from "../utils/response.js";

function safeTopic(topic) {
  if (!topic) return null;
  return {
    id: topic.id,
    category: topic.category,
    subject: topic.subject,
    verifiedFacts: Array.isArray(topic.verifiedFacts) ? [...topic.verifiedFacts] : [],
    personaRelevance: topic.personaRelevance,
    allowedAngles: Array.isArray(topic.allowedAngles) ? [...topic.allowedAngles] : [],
    expiresAt: topic.expiresAt,
  };
}

function safeDiagnostic(inventory, selection) {
  return {
    capturedAt: inventory.capturedAt,
    expiresAt: inventory.expiresAt,
    topicCount: inventory.topics.length,
    expiredCount: inventory.expiredCount,
    topics: inventory.topics.map(safeTopic),
    selectedTopic: safeTopic(selection),
  };
}

export async function runCurrentTopicDiagnostic(env, { at = new Date(), category = null, services = {} } = {}) {
  const readInventory = services.readCurrentTopicInventory || readCurrentTopicInventory;
  const selectTopic = services.selectCurrentTopic || selectCurrentTopic;
  const inventory = await readInventory(env, { at });
  const selection = selectTopic(inventory, { at, category });
  return safeDiagnostic(inventory, selection);
}

export async function handleCurrentTopicDiagnostic(request, env) {
  const adminAuth = await requireAdminApiSession(request, env);
  if (!adminAuth.ok) return adminAuth.response;

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const isRefresh =
    url.pathname === "/admin/diagnostics/current-topics/refresh";

  if (request.method === "GET" && !isRefresh) {
    try {
      return ok(await runCurrentTopicDiagnostic(env, { category }));
    } catch (error) {
      console.error("Current topic diagnostic failed", {
        code: error?.code || "current_topic_diagnostic_failed",
        category: error?.details?.category || null,
      });
      return fail("Current topic diagnostic failed", 502, {
        code: error?.code || "current_topic_diagnostic_failed",
      });
    }
  }

  if (request.method === "POST" && isRefresh) {
    try {
      const inventory = await refreshCurrentTopicInventory(env);
      return ok(safeDiagnostic(
        await readCurrentTopicInventory(env),
        selectCurrentTopic(inventory, { category })
      ));
    } catch (error) {
      console.error("Current topic refresh failed", {
        code: error?.code || "current_topic_refresh_failed",
        category: error?.details?.category || null,
      });
      return fail("Current topic refresh failed", 502, {
        code: error?.code || "current_topic_refresh_failed",
      });
    }
  }

  return fail("Method Not Allowed", 405);
}
