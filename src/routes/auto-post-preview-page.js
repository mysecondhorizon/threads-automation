import {
  requireAdminSession,
} from "../middleware/auth.js";

import {
  html,
} from "../utils/response.js";

export async function handleAutoPostPreviewPage(
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

  <title>
    자동 게시 미리보기
  </title>
</head>

<body style="
  font-family:Arial,sans-serif;
  max-width:900px;
  margin:40px auto;
  padding:0 20px;
  background:#f7f7f7;
">
  <header style="
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:16px;
    margin-bottom:28px;
  ">
    <div>
      <h1 style="
        margin:0 0 8px;
      ">
        자동 게시 미리보기
      </h1>

      <div style="
        color:#666;
      ">
        실제 Threads 게시 없이 AI 결과를 확인합니다.
      </div>
    </div>

    <nav style="
      display:flex;
      gap:8px;
      flex-wrap:wrap;
    ">
      <a href="/admin/dashboard">
        <button
          type="button"
          style="
            padding:10px 14px;
          "
        >
          대시보드
        </button>
      </a>

      <a href="/admin/post">
        <button
          type="button"
          style="
            padding:10px 14px;
          "
        >
          글 작성
        </button>
      </a>
    </nav>
  </header>

  <section style="
    border:1px solid #ddd;
    border-radius:14px;
    padding:20px;
    background:#fff;
    margin-bottom:20px;
  ">
    <form id="preview-form">
      <label
        for="goal"
        style="
          display:block;
          font-weight:700;
          margin-bottom:8px;
        "
      >
        작성 목표
      </label>

      <textarea
        id="goal"
        name="goal"
        rows="4"
        style="
          width:100%;
          box-sizing:border-box;
          padding:12px;
          border:1px solid #ccc;
          border-radius:8px;
          resize:vertical;
          font:inherit;
          line-height:1.6;
        "
      >현재 시간과 최근 게시 성과를 반영한 Threads 게시글 1개를 작성한다.</textarea>

      <label
        for="tone"
        style="
          display:block;
          font-weight:700;
          margin-top:18px;
          margin-bottom:8px;
        "
      >
        말투
      </label>

      <input
        id="tone"
        name="tone"
        type="text"
        value="40대 직장인의 현실적인 말투"
        style="
          width:100%;
          box-sizing:border-box;
          padding:12px;
          border:1px solid #ccc;
          border-radius:8px;
          font:inherit;
        "
      >

      <button
        id="preview-button"
        type="submit"
        style="
          width:100%;
          margin-top:20px;
          padding:13px 16px;
          border:0;
          border-radius:8px;
          background:#111;
          color:#fff;
          font-size:16px;
          font-weight:700;
          cursor:pointer;
        "
      >
        미리보기 생성
      </button>
    </form>
  </section>

  <section
    id="status-card"
    style="
      display:none;
      border:1px solid #ddd;
      border-radius:14px;
      padding:18px;
      background:#fff;
      margin-bottom:20px;
    "
  >
    <div
      id="status-message"
      style="
        font-weight:700;
      "
    ></div>
  </section>

  <section
    id="preview-result"
    style="
      display:none;
    "
  >
    <article style="
      border:1px solid #ddd;
      border-radius:14px;
      padding:20px;
      background:#fff;
      margin-bottom:16px;
    ">
      <h2 style="
        margin-top:0;
      ">
        본문
      </h2>

      <div
        id="post-type"
        style="
          display:inline-block;
          padding:5px 9px;
          border-radius:999px;
          background:#eee;
          font-size:13px;
          margin-bottom:14px;
        "
      ></div>

      <div
        id="post-text"
        style="
          white-space:pre-wrap;
          line-height:1.75;
          word-break:break-word;
        "
      ></div>

      <div style="
        margin-top:16px;
        color:#666;
        font-size:14px;
      ">
        본문 길이:
        <span id="post-length"></span>
      </div>
    </article>

    <article style="
      border:1px solid #ddd;
      border-radius:14px;
      padding:20px;
      background:#fff;
      margin-bottom:16px;
    ">
      <h2 style="
        margin-top:0;
      ">
        첫 댓글
      </h2>

      <div id="first-comment-requested"></div>

      <div
        id="first-comment-text"
        style="
          margin-top:12px;
          white-space:pre-wrap;
          line-height:1.7;
          word-break:break-word;
        "
      ></div>
    </article>

    <details style="
      border:1px solid #ddd;
      border-radius:14px;
      padding:18px;
      background:#fff;
    ">
      <summary style="
        cursor:pointer;
        font-weight:700;
      ">
        전체 JSON 보기
      </summary>

      <pre
        id="raw-json"
        style="
          margin-top:16px;
          overflow:auto;
          white-space:pre-wrap;
          word-break:break-word;
          font-size:13px;
          line-height:1.5;
        "
      ></pre>
    </details>
  </section>

  <script>
    const form =
      document.getElementById(
        "preview-form"
      );

    const button =
      document.getElementById(
        "preview-button"
      );

    const statusCard =
      document.getElementById(
        "status-card"
      );

    const statusMessage =
      document.getElementById(
        "status-message"
      );

    const previewResult =
      document.getElementById(
        "preview-result"
      );

    const postType =
      document.getElementById(
        "post-type"
      );

    const postText =
      document.getElementById(
        "post-text"
      );

    const postLength =
      document.getElementById(
        "post-length"
      );

    const firstCommentRequested =
      document.getElementById(
        "first-comment-requested"
      );

    const firstCommentText =
      document.getElementById(
        "first-comment-text"
      );

    const rawJson =
      document.getElementById(
        "raw-json"
      );

    function showStatus(
      message,
      isError = false
    ) {
      statusCard.style.display =
        "block";

      statusCard.style.borderColor =
        isError
          ? "#e0a0a0"
          : "#ddd";

      statusCard.style.background =
        isError
          ? "#fff5f5"
          : "#fff";

      statusMessage.style.color =
        isError
          ? "#b00020"
          : "#222";

      statusMessage.textContent =
        message;
    }

    function hideStatus() {
      statusCard.style.display =
        "none";
    }

    function renderPreview(
      payload
    ) {
      const data =
        payload.data ||
        payload;

      const comment =
        data.firstComment || {
          requested:
            false,

          text:
            "",
        };

      postType.textContent =
        data.postType ||
        "유형 없음";

      postText.textContent =
        data.text ||
        "";

      postLength.textContent =
        String(
          data.validation?.length ||
          0
        ) +
        " / " +
        String(
          data.validation
            ?.maxLength ||
          500
        ) +
        "자";

      firstCommentRequested
        .textContent =
        comment.requested
          ? "첫 댓글이 생성되었습니다."
          : "첫 댓글이 필요하지 않은 글입니다.";

      firstCommentText.textContent =
        comment.text ||
        "첫 댓글 없음";

      rawJson.textContent =
        JSON.stringify(
          payload,
          null,
          2
        );

      previewResult.style.display =
        "block";
    }

    form.addEventListener(
      "submit",
      async (
        event
      ) => {
        event.preventDefault();

        button.disabled =
          true;

        button.textContent =
          "생성 중...";

        previewResult.style.display =
          "none";

        showStatus(
          "AI가 미리보기를 생성하고 있습니다."
        );

        try {
          const response =
            await fetch(
              "/admin/auto-post/preview",
              {
                method:
                  "POST",

                headers: {
                  "content-type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    goal:
                      document
                        .getElementById(
                          "goal"
                        )
                        .value,

                    tone:
                      document
                        .getElementById(
                          "tone"
                        )
                        .value,
                  }),
              }
            );

          const payload =
            await response.json();

          if (
            !response.ok ||
            payload.ok === false
          ) {
            throw new Error(
              payload.error ||
              "미리보기 생성에 실패했습니다."
            );
          }

          hideStatus();

          renderPreview(
            payload
          );
        } catch (
          error
        ) {
          showStatus(
            error instanceof Error
              ? error.message
              : String(error),
            true
          );
        } finally {
          button.disabled =
            false;

          button.textContent =
            "미리보기 생성";
        }
      }
    );
  </script>
</body>
</html>`);
}