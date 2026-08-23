import { requireAdminSession } from "../middleware/auth.js";
import { buildWritePageClientScript } from "./app-write-client.js";
import { renderAppShell } from "./app-shell.js";

function renderWritePageContent() {
  return `<style>
    .app-write-layout { display: grid; gap: 32px; }
    .app-write-panel { padding: 24px; border: 1px solid #e2e6ec; border-radius: 14px; background: #fff; }
    .app-write-panel h2 { margin: 0 0 20px; font-size: 20px; letter-spacing: -0.02em; }
    .app-write-form { display: grid; gap: 18px; }
    .app-write-label { display: grid; gap: 7px; color: #344054; font-size: 14px; font-weight: 700; }
    .app-write-input, .app-write-select, .app-write-textarea { width: 100%; border: 1px solid #cfd6e2; border-radius: 9px; background: #fff; color: #1d2433; font: inherit; padding: 11px 12px; }
    .app-write-textarea { min-height: 260px; resize: vertical; line-height: 1.65; }
    .app-write-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .app-write-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .app-write-button { border: 1px solid #cfd6e2; border-radius: 8px; background: #fff; color: #344054; cursor: pointer; font: inherit; font-weight: 700; padding: 9px 13px; }
    .app-write-button:hover { background: #f7f8fa; }
    .app-write-button:disabled { cursor: wait; opacity: .65; }
    .app-write-button.primary { border-color: #294d9a; background: #294d9a; color: #fff; }
    .app-write-button.danger { color: #b42318; }
    .app-write-feedback { min-height: 22px; margin: 0; color: #667085; font-size: 14px; }
    .app-write-feedback.success { color: #067647; }
    .app-write-feedback.error { color: #b42318; }
    .app-write-post-list { display: grid; gap: 12px; }
    .app-write-post { padding: 18px; border: 1px solid #e2e6ec; border-radius: 12px; background: #fff; }
    .app-write-post h3 { margin: 0 0 8px; font-size: 16px; }
    .app-write-meta { margin: 0; color: #667085; font-size: 13px; }
    .app-write-preview { margin: 12px 0 16px; color: #475467; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
    .app-write-list-feedback { margin: 0; color: #667085; }
    .app-topic-list { display: grid; gap: 10px; margin: 16px 0; }
    .app-topic-card { display: grid; gap: 5px; width: 100%; padding: 14px; border: 1px solid #e2e6ec; border-radius: 10px; background: #fff; color: #344054; cursor: pointer; font: inherit; text-align: left; }
    .app-topic-card:hover, .app-topic-card.is-selected { border-color: #6a8ed8; background: #f3f6fd; }
    .app-topic-card strong { color: #1d2433; font-size: 15px; }
    .app-topic-card span, .app-topic-card small { color: #667085; line-height: 1.5; }
    .app-topic-card small { font-size: 12px; }
    @media (max-width: 640px) { .app-write-panel { padding: 18px; } .app-write-fields { grid-template-columns: 1fr; } .app-write-textarea { min-height: 220px; } }
  </style>
  <div class="app-write-layout">
    <section class="app-write-panel" aria-labelledby="topic-heading">
      <h2 id="topic-heading">AI로 글 작성</h2>
      <p class="app-write-list-feedback">Topic을 선택하면 AI 초안을 현재 editor에 불러옵니다. 자동 저장이나 외부 게시가 이루어지지 않습니다.</p>
      <div class="app-write-actions" style="margin-top:16px;">
        <button id="topic-refresh" class="app-write-button" type="button">Topic 가져오기</button>
        <button id="topic-generate" class="app-write-button primary" type="button" disabled>선택한 Topic으로 글 작성</button>
      </div>
      <p id="topic-feedback" class="app-write-feedback" role="status" aria-live="polite"></p>
      <div id="topic-list" class="app-topic-list" aria-label="현재 Topic"></div>
    </section>
    <section class="app-write-panel" aria-labelledby="post-editor-heading">
      <h2 id="post-editor-heading">새 글</h2>
      <form id="post-editor" class="app-write-form">
        <label class="app-write-label" for="post-title">제목
          <input id="post-title" class="app-write-input" type="text" autocomplete="off" placeholder="선택 사항">
        </label>
        <div class="app-write-fields">
          <label class="app-write-label" for="post-format">형식
            <select id="post-format" class="app-write-select"><option value="TEXT">TEXT</option><option value="HTML">HTML</option></select>
          </label>
          <label class="app-write-label" for="post-status">상태
            <select id="post-status" class="app-write-select"><option value="DRAFT">DRAFT</option><option value="READY">READY</option></select>
          </label>
        </div>
        <label class="app-write-label" for="post-body">본문
          <textarea id="post-body" class="app-write-textarea" required placeholder="게시글 본문을 작성하세요."></textarea>
        </label>
        <div class="app-write-actions">
          <button id="post-new" class="app-write-button" type="button">새 글</button>
          <button id="post-save" class="app-write-button primary" type="submit">저장</button>
          <button id="post-cancel" class="app-write-button" type="button">변경 취소</button>
        </div>
        <p id="post-feedback" class="app-write-feedback" role="status" aria-live="polite"></p>
      </form>
    </section>
    <section aria-labelledby="saved-post-heading">
      <h2 id="saved-post-heading">저장된 글</h2>
      <p id="saved-post-feedback" class="app-write-list-feedback" role="status" aria-live="polite">저장된 글을 불러오는 중...</p>
      <div id="saved-post-list" class="app-write-post-list"></div>
    </section>
  </div>
  <script>${buildWritePageClientScript()}</script>`;
}

export async function handleAppWritePage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;
  return renderAppShell({
    activePath: "/app/write",
    title: "글 작성",
    description: "직접 작성한 글을 저장하고 게시 준비 상태를 관리합니다.",
    content: renderWritePageContent(),
  });
}
