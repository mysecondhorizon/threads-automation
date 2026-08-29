import { requireAdminSession } from "../middleware/auth.js";
import { renderAppShell } from "./app-shell.js";
import { appAppsClientScript } from "./app-apps-client.js";

export async function handleAppAppsPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;

  return renderAppShell({
    activePath: "/app/apps",
    title: "앱 연결",
    description: "운영에 사용하는 앱 연결 정보를 확인하고 관리합니다. Threads 연결 상태는 현재 저장된 연결 정보만 기준으로 표시됩니다.",
    content: `<style>
      .operator-app-layout { display:grid; gap:18px; }
      .operator-app-panel,.operator-app-card { padding:20px; border:1px solid #e2e6ec; border-radius:14px; background:#fff; }
      .operator-app-panel h2,.operator-app-card h2 { margin:0; font-size:18px; }
      .operator-app-create { display:flex; flex-wrap:wrap; gap:10px; align-items:end; margin-top:14px; }
      .operator-app-create label { display:grid; gap:6px; color:#4f596b; font-size:13px; font-weight:650; }
      .operator-app-create input,.operator-app-create select,.operator-app-controls input { min-height:38px; padding:7px 9px; border:1px solid #cfd6e2; border-radius:8px; font:inherit; }
      .operator-app-list { display:grid; gap:12px; }
      .operator-app-card-header { display:flex; justify-content:space-between; gap:12px; align-items:start; }
      .operator-app-status { padding:4px 8px; border-radius:999px; background:#edf3ff; color:#2c579d; font-size:12px; font-weight:700; white-space:nowrap; }
      .operator-app-details { display:grid; grid-template-columns:max-content 1fr; gap:6px 14px; margin:15px 0; color:#596478; font-size:14px; }
      .operator-app-details dt { font-weight:700; color:#313b4c; }.operator-app-details dd { margin:0; }
      .operator-app-controls { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }.operator-app-active { font-size:14px; color:#4f596b; }.operator-app-active input { min-height:auto; }
      .operator-app-future { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; color:#596478; }.operator-app-future span { padding:8px 10px; border:1px solid #d9dee8; border-radius:8px; font-size:14px; }
      #operator-app-feedback[data-state="error"] { color:#b42318; } #operator-app-feedback[data-state="success"] { color:#087443; }
    </style>
    <div class="operator-app-layout">
      <section class="operator-app-panel">
        <h2>등록된 앱 연결</h2>
        <p id="operator-app-feedback" role="status"></p>
        <div id="operator-app-list" class="operator-app-list" aria-live="polite"></div>
      </section>
      <section class="operator-app-panel">
        <h2>앱 연결 추가</h2>
        <form id="operator-app-create-form" class="operator-app-create">
          <label>이름<input name="name" type="text" maxlength="120" required></label>
          <label>유형<select name="type"><option value="THREADS">Threads</option></select></label>
          <label class="operator-app-active"><input name="active" type="checkbox" checked> 운영 설정 사용</label>
          <button class="app-media-button primary" type="submit">추가</button>
        </form>
      </section>
      <section class="operator-app-panel">
        <h2>향후 지원 예정</h2>
        <div class="operator-app-future"><span>WordPress · 준비 중</span><span>Custom API · 준비 중</span></div>
      </section>
    </div>
    ${appAppsClientScript()}`,
  });
}
