import { requireAdminApiSession } from "../middleware/auth.js";
import {
  generateThreadsDraft,
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
      "친근하고 통찰력 있는"
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
    const draft = await generateThreadsDraft(env, {
      topic,
      tone,
    });

    return ok({
      draft,
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
