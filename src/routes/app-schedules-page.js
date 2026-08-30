import { requireAdminSession } from "../middleware/auth.js";
import { renderAppShell } from "./app-shell.js";
import { buildSchedulesPageClientScript } from "./app-schedules-client.js";
import { buildSchedulesDiagnosticsClientScript } from "./app-schedules-diagnostics-client.js";

function content() {
  return `<style>
    .app-schedule-layout{display:grid;gap:24px}.app-schedule-panel,.app-schedule-card{padding:22px;border:1px solid #e2e6ec;border-radius:14px;background:#fff}.app-schedule-panel h2,.app-schedule-card h2{margin:0 0 10px}.app-schedule-notice{background:#fff8e6;border-color:#f6d98b;color:#664d03}.app-production-overview{display:grid;gap:16px}.app-production-group{display:grid;gap:8px}.app-production-group h3{margin:0}.app-production-items{display:grid;gap:8px}.app-production-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 18px;padding:12px;border:1px solid #e2e6ec;border-radius:10px}.app-production-item strong{color:#344054}.app-production-item span{color:#667085}.app-production-item .app-production-next{grid-column:1/-1}.app-schedule-form,.app-schedule-editor{display:grid;gap:12px;max-width:520px}.app-schedule-form label,.app-schedule-editor label{display:grid;gap:6px;font-weight:700}.app-schedule-form input,.app-schedule-form select,.app-schedule-editor input{font:inherit;padding:9px;border:1px solid #cfd6e2;border-radius:8px}.app-schedule-list,.app-schedule-history{display:grid;gap:12px}.app-schedule-meta,.app-runtime-status{color:#667085;line-height:1.6}.app-schedule-history-item{display:grid;gap:4px;padding:14px;border:1px solid #e2e6ec;border-radius:10px}.app-schedule-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.app-schedule-button{border:1px solid #cfd6e2;border-radius:8px;background:#fff;color:#344054;cursor:pointer;font:inherit;font-weight:700;padding:9px 13px}.app-schedule-form .primary{border-color:#294d9a;background:#294d9a;color:#fff}</style>
  <div class="app-schedule-layout">
    <section class="app-schedule-panel app-schedule-notice"><h2>현재 자동 실행 방식</h2><p id="schedule-production-status">기존 Cloudflare 자동 실행</p><p id="schedule-gate">런타임 스케줄러는 전환 준비 중입니다.</p></section>
    <section class="app-schedule-panel"><h2>현재 실제 자동 실행 일정</h2><p>Asia/Seoul 기준의 현재 실제 운영 일정입니다.</p><div id="production-schedule-overview" class="app-production-overview"></div></section>
    <section class="app-schedule-panel"><h2>런타임 스케줄러 상태</h2><p>전환 준비용 상태이며 현재 실제 자동 게시 소유권을 의미하지 않습니다.</p><div class="app-runtime-status"><div id="runtime-health"></div><div id="runtime-alarm-state"></div><div id="runtime-alarm-at"></div><div id="runtime-calculated-next"></div><div id="runtime-enabled-count"></div><div id="runtime-last-status"></div></div><div class="app-schedule-actions"><button id="schedule-reconcile" class="app-schedule-button" type="button">알람 상태 복구</button></div><p id="reconcile-status" role="status" aria-live="polite"></p></section>
    <section class="app-schedule-panel"><h2>일정 추가</h2><form id="schedule-form" class="app-schedule-form"><label>이름<input name="name" maxlength="120" required></label><label>종류<select name="type"><option value="GENERAL_AUTO">General AUTO</option><option value="PRODUCT_REVIEW">Product Review</option></select></label><label>실행 시간<input name="time" type="time" required></label><label><input name="enabled" type="checkbox"> 활성</label><button class="app-schedule-button primary" type="submit">추가</button></form></section>
    <section><h2>일정</h2><p id="schedule-status" role="status" aria-live="polite"></p><div id="schedule-list" class="app-schedule-list"></div></section>
    <section><h2>최근 자동 실행</h2><div id="schedule-history" class="app-schedule-history"></div></section>
  </div><script>${buildSchedulesPageClientScript()}</script>`;
}

export async function handleAppSchedulesPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;
  return renderAppShell({ activePath: "/app/schedules", title: "자동 게시", description: "자동 실행 시간을 관리합니다.", content: `${content()}<script>${buildSchedulesDiagnosticsClientScript()}</script>` });
}
