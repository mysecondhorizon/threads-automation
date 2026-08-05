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
        AI 결과를 검수한 뒤 같은 내용으로 실제 게시합니다.
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
        white-space:pre-wrap;
        line-height:1.6;
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

      <textarea
        id="post-text"
        rows="9"
        style="
          width:100%;
          box-sizing:border-box;
          padding:14px;
          border:1px solid #ccc;
          border-radius:10px;
          resize:vertical;
          font:inherit;
          line-height:1.75;
        "
      ></textarea>

      <div style="
        margin-top:12px;
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

      <div
        id="first-comment-requested"
        style="
          margin-bottom:12px;
          color:#555;
        "
      ></div>

      <textarea
        id="first-comment-text"
        rows="6"
        placeholder="첫 댓글이 필요하지 않으면 비워두세요."
        style="
          width:100%;
          box-sizing:border-box;
          padding:14px;
          border:1px solid #ccc;
          border-radius:10px;
          resize:vertical;
          font:inherit;
          line-height:1.7;
        "
      ></textarea>

      <div style="
        margin-top:12px;
        color:#666;
        font-size:14px;
      ">
        첫 댓글 길이:
        <span id="first-comment-length">
          0 / 500자
        </span>
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
        실제 게시
      </h2>

      <p style="
        line-height:1.65;
        color:#555;
      ">
        아래 버튼을 누르면 현재 화면에 표시된 본문과 첫 댓글이 그대로 Threads에 게시됩니다.
        AI를 다시 호출하지 않습니다.
      </p>

      <button
        id="publish-button"
        type="button"
        style="
          width:100%;
          padding:14px 16px;
          border:0;
          border-radius:8px;
          background:#0b6b3a;
          color:#fff;
          font-size:16px;
          font-weight:700;
          cursor:pointer;
        "
      >
        이 내용으로 실제 게시
      </button>
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

    const previewButton =
      document.getElementById(
        "preview-button"
      );

    const publishButton =
      document.getElementById(
        "publish-button"
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

    const firstCommentLength =
      document.getElementById(
        "first-comment-length"
      );

    const rawJson =
      document.getElementById(
        "raw-json"
      );

    let latestPreview =
      null;

    function showStatus(
      message,
      isError = false
    ) {
      statusCard.style.display =
        "block";

      statusCard.style.borderColor =
        isError
          ? "#e0a0a0"
          : "#9fcdb5";

      statusCard.style.background =
        isError
          ? "#fff5f5"
          : "#f3fff8";

      statusMessage.style.color =
        isError
          ? "#b00020"
          : "#0b5d34";

      statusMessage.textContent =
        message;
    }

    function hideStatus() {
      statusCard.style.display =
        "none";
    }

    function getPayloadData(
      payload
    ) {
      return (
        payload.data ||
        payload
      );
    }

    function updateLengths() {
      const textLength =
        postText.value.length;

      const commentLength =
        firstCommentText
          .value
          .length;

      postLength.textContent =
        String(
          textLength
        ) +
        " / 500자";

      firstCommentLength.textContent =
        String(
          commentLength
        ) +
        " / 500자";

      postLength.style.color =
        textLength > 500
          ? "#b00020"
          : "#666";

      firstCommentLength.style.color =
        commentLength > 500
          ? "#b00020"
          : "#666";
    }

    function renderPreview(
      payload
    ) {
      const data =
        getPayloadData(
          payload
        );

      const comment =
        data.firstComment || {
          requested:
            false,

          text:
            "",
        };

      latestPreview =
        data;

      postType.textContent =
        data.postType ||
        "유형 없음";

      postText.value =
        data.text ||
        "";

      firstCommentRequested
        .textContent =
        comment.requested
          ? "첫 댓글이 생성되었습니다. 필요하면 수정할 수 있습니다."
          : "첫 댓글이 필요하지 않은 글입니다. 필요하면 직접 입력할 수 있습니다.";

      firstCommentText.value =
        comment.text ||
        "";

      rawJson.textContent =
        JSON.stringify(
          payload,
          null,
          2
        );

      updateLengths();

      previewResult.style.display =
        "block";
    }

    async function generatePreview() {
      previewButton.disabled =
        true;

      previewButton.textContent =
        "생성 중...";

      publishButton.disabled =
        true;

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
        latestPreview =
          null;

        showStatus(
          error instanceof Error
            ? error.message
            : String(error),
          true
        );
      } finally {
        previewButton.disabled =
          false;

        previewButton.textContent =
          "미리보기 생성";

        publishButton.disabled =
          false;
      }
    }

    async function publishReviewedPost() {
      if (!latestPreview) {
        showStatus(
          "먼저 미리보기를 생성해 주세요.",
          true
        );

        return;
      }

      const text =
        postText.value.trim();

      const firstComment =
        firstCommentText
          .value
          .trim();

      if (!text) {
        showStatus(
          "게시할 본문이 비어 있습니다.",
          true
        );

        return;
      }

      if (
        text.length > 500
      ) {
        showStatus(
          "본문이 500자를 초과했습니다.",
          true
        );

        return;
      }

      if (
        firstComment.length >
        500
      ) {
        showStatus(
          "첫 댓글이 500자를 초과했습니다.",
          true
        );

        return;
      }

      const confirmed =
        window.confirm(
          "현재 본문을 실제 Threads에 게시하시겠습니까?"
        );

      if (!confirmed) {
        return;
      }

      publishButton.disabled =
        true;

      previewButton.disabled =
        true;

      publishButton.textContent =
        "게시 중...";

      showStatus(
        "검수된 내용을 Threads에 게시하고 있습니다."
      );

      try {
        const response =
          await fetch(
            "/admin/auto-post/publish-reviewed",
            {
              method:
                "POST",

              headers: {
                "content-type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  text,

                  postType:
                    latestPreview
                      .postType ||
                    "",

                  firstComment,
                }),
            }
          );

        const payload =
          await response.json();

        if (
          !response.ok ||
          payload.ok === false
        ) {
          const details =
            payload.details
              ? "\\n" +
                JSON.stringify(
                  payload.details,
                  null,
                  2
                )
              : "";

          throw new Error(
            (
              payload.error ||
              "실제 게시에 실패했습니다."
            ) +
            details
          );
        }

        const data =
          getPayloadData(
            payload
          );

        const commentResult =
          data.firstComment || {
            requested:
              false,

            published:
              false,

            replyId:
              null,
          };

        let message =
          "본문 게시가 완료되었습니다.\\n" +
          "Post ID: " +
          String(
            data.post_id ||
            "-"
          );

        if (
          commentResult.requested
        ) {
          message +=
            "\\n첫 댓글 게시: " +
            (
              commentResult.published
                ? "성공"
                : "실패"
            );

          if (
            commentResult.replyId
          ) {
            message +=
              "\\nReply ID: " +
              String(
                commentResult.replyId
              );
          }
        } else {
          message +=
            "\\n첫 댓글: 없음";
        }

        showStatus(
          message
        );

        publishButton.textContent =
          "게시 완료";

        rawJson.textContent =
          JSON.stringify(
            payload,
            null,
            2
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

        publishButton.disabled =
          false;

        previewButton.disabled =
          false;

        publishButton.textContent =
          "이 내용으로 실제 게시";
      }
    }

    form.addEventListener(
      "submit",
      async (
        event
      ) => {
        event.preventDefault();

        await generatePreview();
      }
    );

    publishButton.addEventListener(
      "click",
      publishReviewedPost
    );

    postText.addEventListener(
      "input",
      updateLengths
    );

    firstCommentText.addEventListener(
      "input",
      updateLengths
    );
  </script>
</body>
</html>`);
}