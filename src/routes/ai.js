import { requireAdminApiSession } from "../middleware/auth.js";
import {
  generateThreadsDrafts,
  AiServiceError,
} from "../services/ai.js";
import { ok, fail } from "../utils/response.js";

export async function handleGenerateDraft(request, env) {
  const adminAuth = await requireAdminApiSession(
    request,
    env
  );

  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  let formData;

  try {
    formData = await request.formData();
  } catch {
    return fail("Invalid form data", 400);
  }

  const topic = String(
    formData.get("topic") || ""
  ).trim();

  const tone = String(
    formData.get("tone") ||
      "30대 중후반 직장인의 담백하고 현실적인 말투"
  ).trim();

  if (!topic) {
    return fail("글의 주제를 입력하세요.", 400);
  }

  if (topic.length > 300) {
    return fail(
      "주제는 300자 이하로 입력하세요.",
      400
    );
  }

  try {
    const drafts = await generateThreadsDrafts(env, {
      topic,
      tone,
    });

    return ok({
      drafts,
      topic,
      tone,
    });
  } catch (error) {
    if (error instanceof AiServiceError) {
      console.error("AI draft generation failed", {
        message: error.message,
        details: error.details,
      });

      return fail(
        "AI 초안 생성에 실패했습니다.",
        502,
        {
          reason: error.message,
        }
      );
    }

    console.error("Unexpected AI error", error);

    return fail(
      "Unexpected server error",
      500
    );
  }
}
