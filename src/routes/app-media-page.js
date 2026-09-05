import { requireAdminSession } from "../middleware/auth.js";
import { resolveCurrentAppContext } from "../services/app-context.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
import { buildMediaPageClientScript } from "./app-media-client.js";
import { renderAppShell, renderAppWorkspaceUnavailable } from "./app-shell.js";

function renderMediaPageContent() {
  return `<style>
    .app-media-layout { display:grid; gap:30px; }
    .app-media-panel { padding:24px; border:1px solid #e2e6ec; border-radius:14px; background:#fff; }
    .app-media-panel h2 { margin:0 0 12px; font-size:20px; }
    .app-media-copy, .app-media-feedback, .app-media-list-feedback { color:#667085; line-height:1.6; }
    .app-media-upload-form { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-top:18px; }
    .app-media-file { max-width:100%; }
    .app-media-hints { display:grid; gap:10px; margin-top:14px; max-width:680px; }
    .app-media-hints label { display:grid; gap:6px; color:#344054; font-size:14px; font-weight:700; }
    .app-media-hints input, .app-media-hints textarea { width:100%; box-sizing:border-box; border:1px solid #cfd6e2; border-radius:8px; font:inherit; padding:9px; }
    .app-media-hints textarea { min-height:76px; resize:vertical; }
    .app-media-hints p { margin:0; color:#667085; font-size:13px; line-height:1.5; }
    .app-media-button { border:1px solid #cfd6e2; border-radius:8px; background:#fff; color:#344054; cursor:pointer; font:inherit; font-weight:700; padding:9px 13px; }
    .app-media-button:hover { background:#f7f8fa; }
    .app-media-button:disabled { cursor:wait; opacity:.65; }
    .app-media-button.primary { border-color:#294d9a; background:#294d9a; color:#fff; }
    .app-media-upload-results { margin:12px 0 0; padding-left:20px; color:#475467; }
    .app-media-list { display:grid; gap:14px; }
    .app-media-card { display:grid; grid-template-columns:minmax(180px, 280px) minmax(0, 1fr); gap:18px; padding:18px; border:1px solid #e2e6ec; border-radius:14px; background:#fff; }
    .app-media-card.is-inactive { opacity:.7; }
    .app-media-preview { width:100%; max-height:240px; border-radius:10px; background:#eef1f5; object-fit:contain; }
    .app-media-content h3 { margin:0 0 8px; font-size:17px; }
    .app-media-meta, .app-media-tags { margin:0; color:#667085; font-size:13px; }
    .app-media-description { margin:14px 0 10px; color:#344054; line-height:1.6; white-space:pre-wrap; word-break:break-word; }
    .app-media-experience { display:grid; gap:5px; margin-top:12px; padding:10px 12px; border-radius:9px; background:#f8fafc; color:#475467; font-size:13px; line-height:1.5; }
    .app-media-experience-note { margin:0; white-space:pre-wrap; word-break:break-word; }
    .app-media-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
    .app-media-edit-form { display:grid; gap:12px; grid-column:1 / -1; padding-top:16px; border-top:1px solid #e2e6ec; }
    .app-media-edit-form label { display:grid; gap:6px; color:#344054; font-size:14px; font-weight:700; }
    .app-media-edit-form textarea, .app-media-edit-form input { width:100%; border:1px solid #cfd6e2; border-radius:8px; font:inherit; padding:9px; }
    .app-media-edit-form textarea { min-height:100px; resize:vertical; }
    .app-media-feedback.success { color:#067647; } .app-media-feedback.error { color:#b42318; }
    @media (max-width:700px) { .app-media-panel { padding:18px; } .app-media-card { grid-template-columns:1fr; } }
  </style>
  <div class="app-media-layout">
    <section class="app-media-panel" aria-labelledby="media-upload-heading">
      <h2 id="media-upload-heading">&#49324;&#51652;/&#46041;&#50689;&#49345; &#50629;&#47196;&#46300;</h2>
      <p class="app-media-copy">&#50629;&#47196;&#46300;&#54616;&#47732; AI&#44032; &#49444;&#47749;&#44284; &#53468;&#44536;&#47484; &#51088;&#46041;&#51004;&#47196; &#51089;&#49457;&#54633;&#45768;&#45796;.</p>
      <form id="media-upload-form" class="app-media-upload-form">
        <input id="media-files" class="app-media-file" name="files" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple required>
        <button id="media-upload-button" class="app-media-button primary" type="submit">&#50629;&#47196;&#46300;</button>
      </form>
      <div class="app-media-hints">
        <label>&#52404;&#54744; &#53468;&#44536; <input id="media-experience-tags" name="experienceTags" form="media-upload-form" type="text" placeholder="&#52636;&#44540;&#44592;, &#48708; &#50724;&#45716; &#45216;, &#50724;&#47000; &#44152;&#51020;"></label>
        <label>&#52404;&#54744; &#47700;&#47784; <textarea id="media-experience-note" name="experienceNote" form="media-upload-form" placeholder="&#48708; &#50724;&#45716; &#45216; &#52636;&#53748;&#44540;&#54624; &#46412; &#49324;&#50857;. &#49373;&#44033;&#48372;&#45796; &#44032;&#48317;&#44256; &#48120;&#45144;&#47101;&#51648; &#50506;&#50520;&#51020."></textarea></label>
        <p>&#46160; &#54637;&#47785;&#51008; &#49440;&#53469; &#51077;&#47141;&#51077;&#45768;&#45796;. &#49324;&#50857;&#51088;&#44032; &#51228;&#44277;&#54620; &#52404;&#54744; &#51221;&#48372;&#47196;&#47564; &#51200;&#51109;&#46121;&#47728;, &#49440;&#53469;&#54620; &#47784;&#46304; &#54028;&#51068;&#50640; &#46041;&#51068;&#54616;&#44172; &#51201;&#50857;&#46121;&#45768;&#45796;.</p>
      </div>
      <p id="media-upload-feedback" class="app-media-feedback" role="status" aria-live="polite"></p>
      <ul id="media-upload-results" class="app-media-upload-results"></ul>
    </section>
    <section aria-labelledby="media-list-heading">
      <h2 id="media-list-heading">&#48120;&#46356;&#50612;</h2>
      <p id="operator-media-feedback" class="app-media-list-feedback" role="status" aria-live="polite">&#48120;&#46356;&#50612;&#47484; &#48520;&#47084;&#50724;&#45716; &#51473;...</p>
      <div id="operator-media-list" class="app-media-list"></div>
    </section>
  </div>
  <script>${buildMediaPageClientScript()}</script>`;
}

export async function handleAppDailyPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;
  const appContext = await resolveCurrentAppContext(request, env);
  if (!auth.session.legacy && (
    !auth.session.selectedWorkspaceId ||
    (auth.session.selectedWorkspaceId !== DEFAULT_WORKSPACE_ID && !appContext?.currentWorkspace)
  )) {
    return renderAppWorkspaceUnavailable(appContext, "/app/daily");
  }
  return renderAppShell({
    activePath: "/app/daily",
    title: "Daily",
    description: "\uC77C\uC0C1 \uC0AC\uC9C4\uACFC \uB3D9\uC601\uC0C1\uC744 \uC5C5\uB85C\uB4DC\uD558\uACE0 \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
    content: renderMediaPageContent(),
    appContext,
  });
}

export async function handleAppMediaPage(request, env) {
  return Response.redirect(new URL("/app/daily", request.url).toString(), 302);
}
