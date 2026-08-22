import { requireAdminApiSession } from "../middleware/auth.js";
import {
  AutoPostEngineError,
  executeAutoPost,
} from "../services/auto-post-engine.js";
import { fail, ok } from "../utils/response.js";

function safeCronAutoResult(result) {
  const metadata = result?.metadata || {};
  const currentTopicId = metadata.currentTopicId || null;

  return {
    executed: true,
    source: result?.source || "cron_auto_general",
    postId: result?.post_id || null,
    text: result?.text || "",
    contentMode: currentTopicId
      ? "current_topic_reaction"
      : "everyday_personal",
    currentTopicId,
    currentTopicCategory: metadata.currentTopicCategory || null,
    currentTopicSelectedAngle: metadata.selectedAngle || null,
    generation: {
      attempts: result?.generation?.attempts || 0,
      regenerated: Boolean(result?.generation?.regenerated),
      formatSignature: result?.generation?.formatSignature || null,
      targetFormatId: result?.generation?.targetFormatId || null,
    },
    validation: {
      length: result?.validation?.length || 0,
      maxLength: result?.validation?.maxLength || null,
    },
  };
}

export async function runCronAutoGeneralOnce(env, { services = {} } = {}) {
  const runAutoPost = services.executeAutoPost || executeAutoPost;
  const result = await runAutoPost(env, {
    source: "cron_auto_general",
    generalOnly: true,
  });
  return safeCronAutoResult(result);
}

export async function handleCronAutoGeneralDiagnostic(request, env) {
  const adminAuth = await requireAdminApiSession(request, env);
  if (!adminAuth.ok) return adminAuth.response;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);

  try {
    return ok(await runCronAutoGeneralOnce(env));
  } catch (error) {
    if (error instanceof AutoPostEngineError) {
      return fail(error.message, error.status, {
        code: error.code,
        step: error.step,
      });
    }

    console.error("Cron AUTO general diagnostic failed", {
      code: error?.code || "cron_auto_general_execution_failed",
    });
    return fail("Cron AUTO general execution failed", 500, {
      code: error?.code || "cron_auto_general_execution_failed",
    });
  }
}
