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
      <option value="친근하고 통찰력 있는">
        친근하고 통찰력 있는
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