import { requireAdminApiSession } from "../middleware/auth.js";
import { resolveCurrentTopicForGeneralAuto } from "../services/auto-post/engine.js";
import { getPostingHistory } from "../services/history.js";
import { fail, ok } from "../utils/response.js";

function safeSelectedTopic(topic) {
  if (!topic) return null;

  return {
    topicId: topic.topicId,
    category: topic.category,
    subject: topic.subject,
    selectedAngle: topic.selectedAngle,
    talkingPoints: Array.isArray(topic.talkingPoints) ? [...topic.talkingPoints] : [],
    hookDirection: topic.hookDirection || null,
    personaRelevance: topic.personaRelevance || null,
    expiresAt: topic.expiresAt || null,
  };
}

function safeDiagnostic(decision) {
  return {
    source: "cron_auto_general",
    generalOnly: true,
    nextContentMode: decision.nextContentMode,
    cadence: {
      lastSuccessfulCronContentMode:
        decision.cadence?.lastSuccessfulCronContentMode || null,
      reason: decision.cadence?.reason || "current_topic_slot",
    },
    recentTopicIds: Array.isArray(decision.recentTopicIds)
      ? [...decision.recentTopicIds]
      : [],
    inventoryAvailable: decision.inventoryAvailable,
    eligibleTopicCount: Number.isInteger(decision.eligibleTopicCount)
      ? decision.eligibleTopicCount
      : 0,
    ...(decision.fallbackReason ? { fallbackReason: decision.fallbackReason } : {}),
    selectedTopic: decision.nextContentMode === "current_topic_reaction"
      ? safeSelectedTopic(decision.currentTopic)
      : null,
  };
}

export async function runCurrentTopicAutoDiagnostic(env, { services = {} } = {}) {
  const readPostingHistory = services.getPostingHistory || getPostingHistory;
  const resolveDecision =
    services.resolveCurrentTopicForGeneralAuto || resolveCurrentTopicForGeneralAuto;
  const history = await readPostingHistory(env);
  const decision = await resolveDecision(
    env,
    { history: { recentSevenDayPosts: history.recentSevenDayPosts } },
    { source: "cron_auto_general", generalOnly: true }
  );
  return safeDiagnostic(decision);
}

export async function handleCurrentTopicAutoDiagnostic(request, env) {
  const adminAuth = await requireAdminApiSession(request, env);
  if (!adminAuth.ok) return adminAuth.response;
  if (request.method !== "GET") return fail("Method Not Allowed", 405);

  try {
    return ok(await runCurrentTopicAutoDiagnostic(env));
  } catch (error) {
    console.error("Current topic AUTO diagnostic failed", {
      code: error?.code || "current_topic_auto_diagnostic_failed",
    });
    return fail("Current topic AUTO diagnostic failed", 502, {
      code: error?.code || "current_topic_auto_diagnostic_failed",
    });
  }
}
