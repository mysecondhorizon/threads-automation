import { requireAdminSession } from "../middleware/auth.js";
import { resolveCurrentAppContext } from "../services/app-context.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
import { renderAppShell, renderAppWorkspaceUnavailable } from "./app-shell.js";

const fields = [
  ["identityWriting", "AI 정체성과 역할", "글의 말투, 관점, 역할을 정리합니다."],
  ["generalWritingPolicy", "글 작성 정책", "일반 글에 반영할 작성 원칙을 기록합니다."],
  ["contentAndFormatPreferences", "콘텐츠와 표현 방식", "선호하는 주제, 구성, 표현 방식을 안내합니다."],
  ["productWritingGuidance", "제품 글 작성 가이드", "제품 후기 글에 반영할 작성 가이드를 기록합니다."],
  ["analyticsWritingGuidance", "성과 반영 가이드", "성과 분석을 글 작성에 반영하는 방식을 안내합니다."],
];

function renderPromptPageContent() {
  const sections = fields.map(([key, label, help]) => `
    <section class="app-prompts-section" aria-labelledby="prompt-${key}-heading">
      <div class="app-prompts-section-heading">
        <h2 id="prompt-${key}-heading">${label}</h2>
        <p>${help}</p>
      </div>
      <label class="app-prompts-label" for="prompt-${key}">${label}
        <textarea id="prompt-${key}" name="${key}" rows="6"></textarea>
      </label>
    </section>`).join("");

  return `<style>
    .app-prompts-layout { display:grid; gap:20px; max-width:900px; }
    .app-prompts-callout { padding:14px 16px; border:1px solid #cbd8f4; border-radius:12px; background:#f4f7ff; color:#344054; font-size:14px; line-height:1.6; }
    .app-prompts-callout strong { color:#294d9a; }
    .app-prompts-form { display:grid; gap:16px; }
    .app-prompts-section { padding:20px; border:1px solid #e2e6ec; border-radius:14px; background:#fff; }
    .app-prompts-section-heading { display:grid; gap:4px; margin-bottom:14px; }
    .app-prompts-section h2 { margin:0; color:#1d2433; font-size:18px; letter-spacing:-.02em; }
    .app-prompts-section p { margin:0; color:#667085; font-size:14px; line-height:1.55; }
    .app-prompts-label { display:grid; gap:7px; color:#344054; font-size:14px; font-weight:700; }
    .app-prompts-label textarea { width:100%; min-height:136px; border:1px solid #cfd6e2; border-radius:9px; background:#fff; color:#1d2433; font:inherit; line-height:1.6; padding:11px; resize:vertical; }
    .app-prompts-label textarea:focus { outline:3px solid rgb(41 77 154 / .16); border-color:#294d9a; }
    .app-prompts-actions { display:flex; flex-wrap:wrap; gap:9px; align-items:center; padding-top:4px; }
    .app-prompts-button { border:1px solid #cfd6e2; border-radius:8px; background:#fff; color:#344054; cursor:pointer; font:inherit; font-weight:700; padding:10px 14px; }
    .app-prompts-button:hover { background:#f7f8fa; }
    .app-prompts-button:disabled { cursor:wait; opacity:.65; }
    .app-prompts-button.primary { border-color:#294d9a; background:#294d9a; color:#fff; }
    .app-prompts-button.primary:hover { background:#213f80; }
    .app-prompts-button.reset { border-color:#f2c7c3; color:#b42318; }
    .app-prompts-button.reset:hover { background:#fff5f4; }
    .app-prompts-feedback { min-height:22px; margin:0; color:#667085; font-size:14px; line-height:1.55; }
    .app-prompts-feedback[data-state="success"] { color:#067647; }
    .app-prompts-feedback[data-state="error"] { color:#b42318; }
    @media (max-width:600px) {
      .app-prompts-section { padding:16px; }
      .app-prompts-actions { display:grid; grid-template-columns:1fr; }
      .app-prompts-button { width:100%; }
      .app-prompts-label textarea { min-height:120px; }
    }
  </style>
  <div class="app-prompts-layout">
    <aside class="app-prompts-callout" aria-label="프롬프트 설정 안내"><strong>보호되는 시스템 규칙</strong> — 시스템 검증·안전·사실 제약과 출력 규칙은 보호됩니다.</aside>
    <form id="prompt-profile-form" class="app-prompts-form">
      ${sections}
      <div class="app-prompts-actions">
        <button class="app-prompts-button primary" type="submit">저장</button>
        <button class="app-prompts-button reset" id="prompt-reset" type="button">기본값 복원</button>
      </div>
      <p id="prompt-status" class="app-prompts-feedback" role="status" aria-live="polite"></p>
    </form>
  </div>
  <script>(() => {
    const form = document.querySelector("#prompt-profile-form");
    const status = document.querySelector("#prompt-status");
    const saveButton = form.querySelector('[type="submit"]');
    const resetButton = document.querySelector("#prompt-reset");
    function setStatus(message, state = "") { status.textContent = message; status.dataset.state = state; }
    async function api(url, options = {}) {
      const response = await fetch(url, options);
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || "요청에 실패했습니다.");
      return data;
    }
    function fill(profile) { for (const [key, value] of Object.entries(profile)) form.elements[key].value = value; }
    async function load() {
      setStatus("프롬프트를 불러오는 중입니다.");
      try { fill((await api("/api/prompts")).prompts); setStatus(""); }
      catch { setStatus("프롬프트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error"); }
    }
    form.onsubmit = async (event) => {
      event.preventDefault();
      const profile = {};
      for (const area of form.querySelectorAll("textarea")) profile[area.name] = area.value;
      try {
        saveButton.disabled = true;
        setStatus("프롬프트를 저장하는 중입니다.");
        const data = await api("/api/prompts", { method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify(profile) });
        fill(data.prompts);
        setStatus("프롬프트가 저장되었습니다.", "success");
      } catch { setStatus("프롬프트를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error"); }
      finally { saveButton.disabled = false; }
    };
    resetButton.onclick = async () => {
      if (!confirm("기본값으로 복원할까요?")) return;
      try {
        resetButton.disabled = true;
        setStatus("기본값을 복원하는 중입니다.");
        fill((await api("/api/prompts/reset", { method:"POST" })).prompts);
        setStatus("기본값으로 복원되었습니다.", "success");
      } catch { setStatus("기본값을 복원하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error"); }
      finally { resetButton.disabled = false; }
    };
    load();
  })()</script>`;
}

export async function handleAppPromptsPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;
  const appContext = await resolveCurrentAppContext(request, env);
  if (!auth.session.legacy && (
    !auth.session.selectedWorkspaceId ||
    (auth.session.selectedWorkspaceId !== DEFAULT_WORKSPACE_ID && !appContext?.currentWorkspace)
  )) {
    return renderAppWorkspaceUnavailable(appContext, "/app/prompts");
  }
  return renderAppShell({
    activePath: "/app/prompts",
    title: "프롬프트",
    description: "직접 AI 글 작성, 자동 게시, 제품 후기 글 작성에 적용됩니다.",
    content: renderPromptPageContent(),
    appContext,
  });
}
