import { config } from "../config.js";
import {
  requireAdminSession,
  requireAdminApiSession,
} from "../middleware/auth.js";
import {
  getJson,
  putText,
} from "../services/kv.js";
import {
  getThreadsProfile,
  publishTextPost,
  ThreadsApiError,
} from "../services/threads.js";
import {
  logPostSuccess,
  logPostFailure,
} from "../services/logger.js";
import { createCookie } from "../utils/cookie.js";
import {
  html,
  ok,
  fail,
} from "../utils/response.js";
import { renderAdminNavigation } from "../services/admin-navigation.js";

export function handleAdminLoginPage() {
  return html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>Second Horizon Admin</title>
</head>

<body style="font-family:Arial;max-width:420px;margin:60px auto;padding:20px;">
  <h1>Second Horizon Admin</h1>

  <form method="POST" action="/admin/login">
    <input
      type="password"
      name="admin_key"
      placeholder="ADMIN_KEY"
      required
      style="width:100%;padding:12px;box-sizing:border-box;"
    >

    <br><br>

    <button
      type="submit"
      style="padding:12px 20px;"
    >
      로그인
    </button>
  </form>
</body>
</html>`);
}

export async function handleAdminLogin(
  request,
  env
) {
  const formData =
    await request.formData();

  const adminKey = String(
    formData.get("admin_key") || ""
  );

  if (adminKey !== env.ADMIN_KEY) {
    return new Response(
      "관리자 키가 올바르지 않습니다.",
      {
        status: 401,
      }
    );
  }

  const sessionId =
    crypto.randomUUID();

  await putText(
    env,
    `admin_session:${sessionId}`,
    "valid",
    {
      expirationTtl:
        config.admin.sessionTtl,
    }
  );

  return new Response(null, {
    status: 302,

    headers: {
      location: "/admin/post",

      "set-cookie": createCookie(
        "admin_session",
        sessionId,
        {
          maxAge:
            config.admin.sessionTtl,
        }
      ),
    },
  });
}

export async function handleAdminPostPage(
  request,
  env
) {
  const auth =
    await requireAdminSession(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  return html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>Second Horizon Admin</title>
</head>

<body style="font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;">
  ${renderAdminNavigation("/admin/post")}
  <h1>Second Horizon</h1>

  <section>
    <h2>🤖 AI 초안 3개 생성</h2>

    <label for="topic">주제</label>

    <br><br>

    <input
      id="topic"
      type="text"
      maxlength="300"
      style="width:100%;padding:12px;box-sizing:border-box;"
      placeholder="예: 직장인이 사이드 프로젝트를 시작해야 하는 이유"
    >

    <br><br>

    <label for="tone">기본 톤</label>

    <br><br>

    <select
      id="tone"
      style="width:100%;padding:12px;box-sizing:border-box;"
    >
      <option value="30대 중후반 직장인의 담백하고 현실적인 말투">
        30대 중후반 직장인의 담백하고 현실적인 말투
      </option>

      <option value="전문적이고 신뢰감 있는">
        전문적이고 신뢰감 있는
      </option>

      <option value="동기부여가 되는">
        동기부여가 되는
      </option>

      <option value="가볍고 유머러스한">
        가볍고 유머러스한
      </option>
    </select>

    <br><br>

    <button
      id="generate-button"
      type="button"
      style="padding:12px 20px;cursor:pointer;"
    >
      AI 초안 3개 생성
    </button>

    <p id="ai-status"></p>

    <div id="draft-options"></div>
  </section>

  <hr style="margin:32px 0;">

  <section>
    <h2>🚀 AI 자동 게시</h2>

    <p>
      현재 시간, 최근 게시글, 성과 데이터를 바탕으로
      AI가 글 1개를 생성한 뒤 즉시 Threads에 게시합니다.
    </p>

    <button
      id="auto-post-button"
      type="button"
      style="padding:12px 20px;cursor:pointer;background:#111;color:#fff;border:none;border-radius:6px;"
    >
      AI 글 생성 후 즉시 게시
    </button>

    <p
      id="auto-post-status"
      style="white-space:pre-wrap;line-height:1.6;"
    ></p>
  </section>

  <hr style="margin:32px 0;">

  <section>
    <h2>AI Selection 진단</h2>

    <p>
      Content Pool 후보 평가와 AI 선택 결과를 게시 없이 1회 확인합니다.
    </p>

    <button
      id="ai-selection-diagnostic-button"
      type="button"
      style="padding:12px 20px;cursor:pointer;"
    >
      AI Selection 진단
    </button>

    <pre
      id="ai-selection-diagnostic-status"
      style="white-space:pre-wrap;line-height:1.6;"
    ></pre>
  </section>

  <hr style="margin:32px 0;">

  <section>
    <h2>Current Topic</h2>

    <p>
      최신 topic inventory를 조회하거나, 관리자 세션으로 1회 refresh합니다.
    </p>

    <button
      id="current-topic-refresh-button"
      type="button"
      style="padding:12px 20px;cursor:pointer;"
    >
      Current Topic Refresh
    </button>

    <button
      id="current-topic-read-button"
      type="button"
      style="padding:12px 20px;cursor:pointer;margin-left:8px;"
    >
      Current Topic 조회
    </button>

    <button
      id="current-topic-auto-preview-button"
      type="button"
      style="padding:12px 20px;cursor:pointer;margin-left:8px;"
    >
      Current Topic AUTO Preview
    </button>

    <button
      id="run-cron-auto-general-button"
      type="button"
      style="padding:12px 20px;cursor:pointer;margin-left:8px;background:#8b0000;color:#fff;border:none;border-radius:6px;"
    >
      Run Cron AUTO Once
    </button>

    <p style="color:#8b0000;">
      실제 Threads 게시 1건이 발생합니다.
    </p>

    <pre
      id="current-topic-diagnostic-status"
      style="white-space:pre-wrap;line-height:1.6;"
    ></pre>

    <pre
      id="current-topic-auto-preview-status"
      style="white-space:pre-wrap;line-height:1.6;"
    ></pre>

    <section
      id="current-topic-auto-media-preview"
      hidden
      style="margin:12px 0;padding:12px;border:1px solid #ddd;border-radius:8px;max-width:560px;"
    >
      <strong>선택된 이미지 미리보기</strong>
      <div id="current-topic-auto-media-summary" style="white-space:pre-wrap;line-height:1.6;margin-top:8px;"></div>
      <img id="current-topic-auto-media-image" alt="" style="display:block;max-width:100%;max-height:320px;margin-top:10px;border-radius:8px;">
      <div id="current-topic-auto-media-fallback" hidden style="margin-top:10px;color:#b00020;"></div>
    </section>

    <pre
      id="run-cron-auto-general-status"
      style="white-space:pre-wrap;line-height:1.6;"
    ></pre>
  </section>

  <hr style="margin:32px 0;">

  <section>
    <h2>Threads 게시</h2>

    <form
      method="POST"
      action="/admin/post"
    >
      <label for="text">
        게시 내용
      </label>

      <br><br>

      <textarea
        id="text"
        name="text"
        rows="12"
        maxlength="500"
        required
        style="width:100%;padding:12px;box-sizing:border-box;"
        placeholder="직접 작성하거나 AI 초안을 선택하세요."
      ></textarea>

      <p>
        <span id="character-count">
          0
        </span>
        / 500
      </p>

      <button
        type="submit"
        style="padding:12px 20px;cursor:pointer;"
      >
        Threads에 게시
      </button>
    </form>
  </section>

  <script>
    const topicInput =
      document.getElementById(
        "topic"
      );

    const toneSelect =
      document.getElementById(
        "tone"
      );

    const textArea =
      document.getElementById(
        "text"
      );

    const generateButton =
      document.getElementById(
        "generate-button"
      );

    const statusElement =
      document.getElementById(
        "ai-status"
      );

    const characterCount =
      document.getElementById(
        "character-count"
      );

    const draftOptions =
      document.getElementById(
        "draft-options"
      );

    const autoPostButton =
      document.getElementById(
        "auto-post-button"
      );

    const autoPostStatus =
      document.getElementById(
        "auto-post-status"
      );

    const aiSelectionDiagnosticButton =
      document.getElementById(
        "ai-selection-diagnostic-button"
      );

    const aiSelectionDiagnosticStatus =
      document.getElementById(
        "ai-selection-diagnostic-status"
      );

    const currentTopicRefreshButton =
      document.getElementById(
        "current-topic-refresh-button"
      );

    const currentTopicReadButton =
      document.getElementById(
        "current-topic-read-button"
      );

    const currentTopicDiagnosticStatus =
      document.getElementById(
        "current-topic-diagnostic-status"
      );

    const currentTopicAutoPreviewButton =
      document.getElementById(
        "current-topic-auto-preview-button"
      );

    const currentTopicAutoPreviewStatus =
      document.getElementById(
        "current-topic-auto-preview-status"
      );

    const currentTopicAutoMediaPreview =
      document.getElementById(
        "current-topic-auto-media-preview"
      );

    const currentTopicAutoMediaSummary =
      document.getElementById(
        "current-topic-auto-media-summary"
      );

    const currentTopicAutoMediaImage =
      document.getElementById(
        "current-topic-auto-media-image"
      );

    const currentTopicAutoMediaFallback =
      document.getElementById(
        "current-topic-auto-media-fallback"
      );

    const runCronAutoGeneralButton =
      document.getElementById(
        "run-cron-auto-general-button"
      );

    const runCronAutoGeneralStatus =
      document.getElementById(
        "run-cron-auto-general-status"
      );

    let aiSelectionDiagnosticStarted =
      false;

    let currentTopicRefreshStarted =
      false;

    let currentTopicAutoPreviewStarted =
      false;

    let cronAutoGeneralStarted =
      false;

    function diagnosticValue(value) {
      return value == null
        ? "-"
        : String(value);
    }

    function showAiSelectionDiagnostic(
      status,
      data
    ) {
      const lines = [
        "HTTP status: " + status,
      ];

      if (!data?.ok) {
        if (status === 401) {
          lines.push(
            "관리자 로그인이 필요합니다."
          );
        }

        if (data?.code) {
          lines.push(
            "error code: " +
            diagnosticValue(data.code)
          );
        }

        if (data?.category) {
          lines.push(
            "error category: " +
            diagnosticValue(data.category)
          );
        }

        aiSelectionDiagnosticStatus.textContent =
          lines.join("\\n");
        return;
      }

      const selection =
        data.selection || {};
      const validation =
        data.validation || {};
      const sideEffects =
        data.sideEffects || {};

      lines.push(
        "totalCandidates: " +
        diagnosticValue(data.totalCandidates),
        "eligibleCandidates: " +
        diagnosticValue(data.eligibleCandidates),
        "packagedCandidates: " +
        diagnosticValue(data.packagedCandidates),
        "candidateId: " +
        diagnosticValue(selection.candidateId),
        "productId: " +
        diagnosticValue(selection.productId),
        "mediaId: " +
        diagnosticValue(selection.mediaId),
        "contentType: " +
        diagnosticValue(selection.contentType),
        "source: " +
        diagnosticValue(selection.source),
        "validation: " +
        diagnosticValue(validation.ok)
      );

      if (selection.fallbackCategory) {
        lines.push(
          "fallbackCategory: " +
          diagnosticValue(
            selection.fallbackCategory
          )
        );
      }

      lines.push(
        "sideEffects.kvWrite: " +
        diagnosticValue(sideEffects.kvWrite),
        "sideEffects.threadsPublish: " +
        diagnosticValue(
          sideEffects.threadsPublish
        ),
        "sideEffects.poolMutation: " +
        diagnosticValue(sideEffects.poolMutation)
      );

      aiSelectionDiagnosticStatus.textContent =
        lines.join("\\n");
    }

    function currentTopicList(value) {
      return Array.isArray(value)
        ? value
          .filter((item) => typeof item === "string")
          .map((item) => diagnosticValue(item))
        : [];
    }

    function appendCurrentTopic(
      lines,
      label,
      topic
    ) {
      if (!topic || typeof topic !== "object") {
        lines.push(label + ": -");
        return;
      }

      lines.push(
        label + ".id: " +
          diagnosticValue(topic.id),
        label + ".category: " +
          diagnosticValue(topic.category),
        label + ".subject: " +
          diagnosticValue(topic.subject),
        label + ".verifiedFacts: " +
          (currentTopicList(topic.verifiedFacts).join(" | ") || "-"),
        label + ".talkingPoints: " +
          (currentTopicList(topic.talkingPoints).join(" | ") || "-"),
        label + ".personaRelevance: " +
          diagnosticValue(topic.personaRelevance),
        label + ".allowedAngles: " +
          (currentTopicList(topic.allowedAngles).join(" | ") || "-"),
        label + ".expiresAt: " +
          diagnosticValue(topic.expiresAt)
      );
    }

    function showCurrentTopicDiagnostic(
      status,
      data
    ) {
      const lines = [
        "HTTP status: " + status,
        "ok: " + (data?.ok === true ? "true" : "false"),
      ];

      if (!data?.ok) {
        if (status === 401) {
          lines.push(
            "관리자 로그인이 필요합니다."
          );
        }

        if (typeof data?.code === "string") {
          lines.push(
            "error code: " +
            diagnosticValue(data.code)
          );
        }

        currentTopicDiagnosticStatus.textContent =
          lines.join("\\n");
        return;
      }

      lines.push(
        "capturedAt: " +
          diagnosticValue(data.capturedAt),
        "expiresAt: " +
          diagnosticValue(data.expiresAt),
        "topicCount: " +
          diagnosticValue(data.topicCount),
        "expiredCount: " +
          diagnosticValue(data.expiredCount)
      );

      const topics =
        Array.isArray(data.topics)
          ? data.topics
          : [];

      topics.forEach((topic, index) => {
        appendCurrentTopic(
          lines,
          "topics[" + index + "]",
          topic
        );
      });

      appendCurrentTopic(
        lines,
        "selectedTopic",
        data.selectedTopic
      );

      currentTopicDiagnosticStatus.textContent =
        lines.join("\\n");
    }

    async function requestCurrentTopicDiagnostic(
      method,
      path
    ) {
      const response =
        await fetch(
          path,
          {
            method,
            credentials: "same-origin",
            headers: {
              accept: "application/json",
            },
          }
        );
      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      showCurrentTopicDiagnostic(
        response.status,
        data
      );
    }

    function showCurrentTopicAutoPreview(
      status,
      data
    ) {
      currentTopicAutoMediaPreview.hidden =
        true;

      const lines = [
        "HTTP status: " + status,
      ];

      if (!data?.ok) {
        if (status === 401) {
          lines.push(
            "관리자 로그인이 필요합니다."
          );
        }

        if (typeof data?.code === "string") {
          lines.push(
            "error code: " +
            diagnosticValue(data.code)
          );
        }

        if (typeof data?.step === "string") {
          lines.push(
            "step: " +
            diagnosticValue(data.step)
          );
        }

        if (
          status === 409 &&
          data?.code ===
            "post_format_validation_failed"
        ) {
          const details =
            data?.details &&
            typeof data.details === "object"
              ? data.details
              : {};

          const reasons =
            Array.isArray(details.reasons)
              ? details.reasons
                .filter(
                  (reason) =>
                    typeof reason === "string"
                )
                .map(
                  (reason) => reason.trim()
                )
                .filter(Boolean)
              : [];

          if (reasons.length) {
            lines.push(
              "reasons: " +
              reasons.join(", ")
            );
          }

          [
            ["signature", details.signature],
            ["targetFormatId", details.targetFormatId],
            ["targetPrompt", details.targetPrompt],
            ["matchedSignature", details.matchedSignature],
            ["attempts", details.attempts],
            ["regenerated", details.regenerated],
            ["reason", details.reason],
          ].forEach(
            ([label, value]) => {
              if (value == null) return;

              lines.push(
                label + ": " +
                diagnosticValue(value)
              );
            }
          );

          if (
            reasons.includes(
              "no_feasible_target_format"
            )
          ) {
            lines.push(
              "no_feasible_target_format: true"
            );
          }
        }

        currentTopicAutoPreviewStatus.textContent =
          lines.join("\\n");
        return;
      }

      const topic =
        data.currentTopic;
      const generation =
        data.generation || {};

      lines.push(
        "topicApplied: " +
          diagnosticValue(Boolean(topic)),
        "text: " +
          diagnosticValue(data.text),
        "formatSignature: " +
          diagnosticValue(generation.formatSignature),
        "targetFormatId: " +
          diagnosticValue(generation.targetFormatId),
        "validation: " +
          diagnosticValue(data.validation?.length != null)
      );

      if (topic && typeof topic === "object") {
        lines.push(
          "topicId: " +
            diagnosticValue(topic.topicId),
          "category: " +
            diagnosticValue(topic.category),
          "subject: " +
            diagnosticValue(topic.subject),
          "selectedAngle: " +
            diagnosticValue(topic.selectedAngle)
        );
      } else {
        lines.push(
          "Current Topic이 없어 기존 AUTO context로 생성했습니다."
        );
      }

      const mediaSelection =
        data.mediaSelection &&
        typeof data.mediaSelection === "object"
          ? data.mediaSelection
          : {};
      const mediaId =
        mediaSelection.mode === "IMAGE"
          ? String(mediaSelection.mediaId || "").trim()
          : "";

      lines.push(
        "publishMode: " +
          (mediaId ? "IMAGE" : "TEXT"),
        "mediaId: " +
          diagnosticValue(mediaId || null),
        "media selection reason: " +
          diagnosticValue(mediaSelection.reason),
        "media candidateCount: " +
          diagnosticValue(mediaSelection.candidateCount),
        "media eligibleCount: " +
          diagnosticValue(mediaSelection.eligibleCount)
      );

      if (mediaId) {
        currentTopicAutoMediaPreview.hidden =
          false;
        currentTopicAutoMediaSummary.textContent =
          "mediaId: " + mediaId + "\nreason: " +
          diagnosticValue(mediaSelection.reason);
        currentTopicAutoMediaFallback.hidden =
          true;
        currentTopicAutoMediaFallback.textContent =
          "";
        currentTopicAutoMediaImage.alt =
          "Current Topic AUTO Preview 이미지";
        currentTopicAutoMediaImage.onload = () => {
          currentTopicAutoMediaImage.hidden =
            false;
          currentTopicAutoMediaFallback.hidden =
            true;
        };
        currentTopicAutoMediaImage.onerror = () => {
          currentTopicAutoMediaImage.hidden =
            true;
          currentTopicAutoMediaFallback.textContent =
            "이미지 미리보기를 불러오지 못했습니다. 본문 preview는 그대로 확인할 수 있습니다.";
          currentTopicAutoMediaFallback.hidden =
            false;
        };
        currentTopicAutoMediaImage.src =
          "/media/" + encodeURIComponent(mediaId);
      }

      currentTopicAutoPreviewStatus.textContent =
        lines.join("\\n");
    }

    function updateCharacterCount() {
      characterCount.textContent =
        textArea.value.length;
    }

    function clearDraftOptions() {
      draftOptions.innerHTML = "";
    }

    function createDraftCard(
      draft,
      index
    ) {
      const card =
        document.createElement(
          "article"
        );

      card.style.border =
        "1px solid #ddd";

      card.style.borderRadius =
        "10px";

      card.style.padding =
        "16px";

      card.style.marginBottom =
        "16px";

      card.style.background =
        "#fafafa";

      const title =
        document.createElement(
          "h3"
        );

      title.textContent =
        (index + 1) +
        ". " +
        draft.style;

      const content =
        document.createElement(
          "p"
        );

      content.textContent =
        draft.text;

      content.style.whiteSpace =
        "pre-wrap";

      content.style.lineHeight =
        "1.6";

      const count =
        document.createElement(
          "p"
        );

      count.textContent =
        draft.text.length +
        " / 500자";

      count.style.fontSize =
        "13px";

      count.style.color =
        "#666";

      const selectButton =
        document.createElement(
          "button"
        );

      selectButton.type =
        "button";

      selectButton.textContent =
        "이 초안 선택";

      selectButton.style.padding =
        "10px 16px";

      selectButton.style.cursor =
        "pointer";

      selectButton.addEventListener(
        "click",
        function () {
          textArea.value =
            draft.text.slice(
              0,
              500
            );

          updateCharacterCount();

          statusElement.textContent =
            draft.style +
            " 초안이 게시 입력란에 반영됐습니다.";

          textArea.focus();

          textArea.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      );

      card.appendChild(title);
      card.appendChild(content);
      card.appendChild(count);
      card.appendChild(
        selectButton
      );

      return card;
    }

    textArea.addEventListener(
      "input",
      updateCharacterCount
    );

    generateButton.addEventListener(
      "click",
      async function () {
        const topic =
          topicInput.value.trim();

        const tone =
          toneSelect.value;

        if (!topic) {
          statusElement.textContent =
            "글의 주제를 입력하세요.";

          topicInput.focus();
          return;
        }

        clearDraftOptions();

        generateButton.disabled =
          true;

        generateButton.textContent =
          "초안 생성 중...";

        statusElement.textContent =
          "AI가 서로 다른 초안 3개를 작성하고 있습니다.";

        try {
          const formData =
            new FormData();

          formData.set(
            "topic",
            topic
          );

          formData.set(
            "tone",
            tone
          );

          const response =
            await fetch(
              "/admin/ai/draft",
              {
                method: "POST",
                body: formData,
              }
            );

          const data =
            await response.json();

          if (
            !response.ok ||
            !data.ok
          ) {
            throw new Error(
              data.error ||
              data.reason ||
              "AI 초안 생성에 실패했습니다."
            );
          }

          if (
            !Array.isArray(
              data.drafts
            ) ||
            data.drafts.length !== 3
          ) {
            throw new Error(
              "AI가 올바른 초안 목록을 반환하지 않았습니다."
            );
          }

          data.drafts.forEach(
            function (
              draft,
              index
            ) {
              const card =
                createDraftCard(
                  draft,
                  index
                );

              draftOptions.appendChild(
                card
              );
            }
          );

          statusElement.textContent =
            "초안 3개가 생성됐습니다. 마음에 드는 글을 선택하세요.";
        } catch (error) {
          statusElement.textContent =
            error.message ||
            "AI 초안 생성 중 오류가 발생했습니다.";
        } finally {
          generateButton.disabled =
            false;

          generateButton.textContent =
            "AI 초안 3개 생성";
        }
      }
    );

    autoPostButton.addEventListener(
      "click",
      async function () {
        const confirmed =
          window.confirm(
            "AI가 글을 생성한 뒤 즉시 Threads에 게시합니다. 계속할까요?"
          );

        if (!confirmed) {
          return;
        }

        autoPostButton.disabled =
          true;

        autoPostButton.textContent =
          "AI 생성 및 게시 중...";

        autoPostStatus.textContent =
          "Context와 최근 성과를 분석해 글을 생성하고 있습니다.";

        try {
          const response =
            await fetch(
              "/admin/auto-post",
              {
                method: "POST",
              }
            );

          const data =
            await response.json();

          if (
            !response.ok ||
            !data.ok
          ) {
            throw new Error(
              data.error ||
              data.reason ||
              "AI 자동 게시에 실패했습니다."
            );
          }

          autoPostStatus.textContent =
            [
              "✅ 자동 게시 성공",
              "",
              "계정: " +
                data.username,
              "게시물 ID: " +
                data.post_id,
              "글 유형: " +
                (
                  data.postType ||
                  "확인되지 않음"
                ),
              "",
              data.text,
            ].join("\\n");

          textArea.value =
            String(
              data.text || ""
            ).slice(
              0,
              500
            );

          updateCharacterCount();
        } catch (error) {
          autoPostStatus.textContent =
            "❌ " +
            (
              error.message ||
              "AI 자동 게시 중 오류가 발생했습니다."
            );
        } finally {
          autoPostButton.disabled =
            false;

          autoPostButton.textContent =
            "AI 글 생성 후 즉시 게시";
        }
      }
    );

    aiSelectionDiagnosticButton.addEventListener(
      "click",
      async function () {
        if (aiSelectionDiagnosticStarted) {
          return;
        }

        aiSelectionDiagnosticStarted =
          true;
        aiSelectionDiagnosticButton.disabled =
          true;
        aiSelectionDiagnosticButton.textContent =
          "AI Selection 진단 실행 중...";
        aiSelectionDiagnosticStatus.textContent =
          "AI Selection 진단을 실행하고 있습니다.";

        try {
          const response =
            await fetch(
              "/admin/diagnostics/ai-selection",
              {
                method: "POST",
                credentials: "same-origin",
                headers: {
                  accept: "application/json",
                },
              }
            );
          let data = {};

          try {
            data = await response.json();
          } catch {
            data = {};
          }

          showAiSelectionDiagnostic(
            response.status,
            data
          );
        } catch {
          aiSelectionDiagnosticStatus.textContent =
            "HTTP status: network error";
        } finally {
          aiSelectionDiagnosticButton.textContent =
            "AI Selection 진단 완료";
        }
      }
    );

    currentTopicRefreshButton.addEventListener(
      "click",
      async function () {
        if (currentTopicRefreshStarted) {
          return;
        }

        currentTopicRefreshStarted =
          true;
        currentTopicRefreshButton.disabled =
          true;
        currentTopicReadButton.disabled =
          true;
        currentTopicRefreshButton.textContent =
          "Current Topic Refresh 실행 중...";
        currentTopicDiagnosticStatus.textContent =
          "Current Topic Refresh를 실행하고 있습니다.";

        try {
          await requestCurrentTopicDiagnostic(
            "POST",
            "/admin/diagnostics/current-topics/refresh"
          );
        } catch {
          currentTopicDiagnosticStatus.textContent =
            "HTTP status: network error";
        } finally {
          currentTopicReadButton.disabled =
            false;
          currentTopicRefreshButton.textContent =
            "Current Topic Refresh 완료";
        }
      }
    );

    currentTopicReadButton.addEventListener(
      "click",
      async function () {
        currentTopicReadButton.disabled =
          true;
        currentTopicDiagnosticStatus.textContent =
          "Current Topic을 조회하고 있습니다.";

        try {
          await requestCurrentTopicDiagnostic(
            "GET",
            "/admin/diagnostics/current-topics"
          );
        } catch {
          currentTopicDiagnosticStatus.textContent =
            "HTTP status: network error";
        } finally {
          currentTopicReadButton.disabled =
            false;
        }
      }
    );

    currentTopicAutoPreviewButton.addEventListener(
      "click",
      async function () {
        if (currentTopicAutoPreviewStarted) {
          return;
        }

        currentTopicAutoPreviewStarted =
          true;
        currentTopicAutoPreviewButton.disabled =
          true;
        currentTopicAutoPreviewButton.textContent =
          "Current Topic AUTO Preview 생성 중...";
        currentTopicAutoPreviewStatus.textContent =
          "Current Topic inventory를 읽고 AUTO 초안을 생성하고 있습니다.";

        try {
          const response =
            await fetch(
              "/admin/auto-post/preview",
              {
                method: "POST",
                credentials: "same-origin",
                headers: {
                  "content-type": "application/json",
                  accept: "application/json",
                },
                body: JSON.stringify({
                  useCurrentTopic: true,
                }),
              }
            );
          let data = {};

          try {
            data = await response.json();
          } catch {
            data = {};
          }

          showCurrentTopicAutoPreview(
            response.status,
            data
          );
        } catch {
          currentTopicAutoPreviewStatus.textContent =
            "HTTP status: network error";
        } finally {
          currentTopicAutoPreviewButton.textContent =
            "Current Topic AUTO Preview 완료";
        }
      }
    );

    runCronAutoGeneralButton.addEventListener(
      "click",
      async function () {
        if (cronAutoGeneralStarted) {
          return;
        }

        const confirmed = window.confirm(
          "cron_auto_general 경로로 실제 Threads 게시 1건을 실행합니다. 계속할까요?"
        );
        if (!confirmed) {
          return;
        }

        cronAutoGeneralStarted = true;
        runCronAutoGeneralButton.disabled = true;
        runCronAutoGeneralButton.textContent =
          "Cron AUTO 실행 중...";
        runCronAutoGeneralStatus.textContent =
          "실제 Threads 게시를 실행하고 있습니다. 다시 실행하지 마세요.";

        try {
          const response = await fetch(
            "/admin/diagnostics/run-cron-auto-general",
            {
              method: "POST",
              credentials: "same-origin",
              headers: { accept: "application/json" },
            }
          );
          let data = {};

          try {
            data = await response.json();
          } catch {
            data = {};
          }

          const lines = ["HTTP status: " + response.status];
          if (!response.ok || !data.ok) {
            if (response.status === 401) {
              lines.push("관리자 로그인이 필요합니다.");
            }
            if (data.code) lines.push("error code: " + diagnosticValue(data.code));
            if (data.step) lines.push("step: " + diagnosticValue(data.step));
          } else {
            const generation = data.generation || {};
            const validation = data.validation || {};
            lines.push(
              "executed: " + diagnosticValue(data.executed),
              "source: " + diagnosticValue(data.source),
              "postId: " + diagnosticValue(data.postId),
              "contentMode: " + diagnosticValue(data.contentMode),
              "currentTopicId: " + diagnosticValue(data.currentTopicId),
              "currentTopicCategory: " + diagnosticValue(data.currentTopicCategory),
              "currentTopicSelectedAngle: " + diagnosticValue(data.currentTopicSelectedAngle),
              "formatSignature: " + diagnosticValue(generation.formatSignature),
              "targetFormatId: " + diagnosticValue(generation.targetFormatId),
              "validation.length: " + diagnosticValue(validation.length),
              "validation.maxLength: " + diagnosticValue(validation.maxLength),
              "",
              String(data.text || "")
            );
          }
          runCronAutoGeneralStatus.textContent = lines.join("\\n");
        } catch {
          runCronAutoGeneralStatus.textContent = "HTTP status: network error";
        } finally {
          runCronAutoGeneralButton.textContent = "Run Cron AUTO Once 완료";
        }
      }
    );

    updateCharacterCount();
  </script>
</body>
</html>`);
}

export async function handleAdminPost(
  request,
  env
) {
  const adminAuth =
    await requireAdminApiSession(
      request,
      env
    );

  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  const formData =
    await request.formData();

  const text = String(
    formData.get("text") || ""
  ).trim();

  if (!text) {
    return fail(
      "게시 내용을 입력하세요.",
      400
    );
  }

  const threadsAuth =
    await getJson(
      env,
      "threads_auth"
    );

  if (!threadsAuth?.access_token) {
    return fail(
      "Threads 연결 정보가 없습니다.",
      400
    );
  }

  try {
    const profile =
      await getThreadsProfile(
        threadsAuth.access_token
      );

    const result =
      await publishTextPost(
        threadsAuth.access_token,
        profile.id,
        text
      );

    await logPostSuccess(
      env,
      profile.username,
      result.postId,
      text
    );

    return ok({
      username:
        profile.username,

      post_id:
        result.postId,

      text,
    });
  } catch (error) {
    if (
      error instanceof
      ThreadsApiError
    ) {
      await logPostFailure(
        env,
        error.step,
        text,
        error.details
      );

      return fail(
        "Threads post failed",
        400,
        {
          step:
            error.step,

          details:
            error.details,
        }
      );
    }

    return fail(
      "Unexpected server error",
      500
    );
  }
}
