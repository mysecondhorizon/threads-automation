import { requirePlatformOperatorSession } from "../middleware/platform-operator-auth.js";
import { SCHEDULER_MODE } from "../services/scheduler-ownership.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function page(content, status = 200, extraHeaders = {}) {
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>운영자 · Second Horizon</title><style>
body{margin:0;background:#f5f6f8;color:#1d2433;font:16px/1.6 system-ui,sans-serif}main{max-width:800px;margin:48px auto;padding:0 24px}header{margin-bottom:28px}h1{margin:8px 0;font-size:32px}section{background:white;border:1px solid #e0e4ec;border-radius:12px;padding:24px;margin:16px 0}h2{margin-top:0;font-size:20px}dt{font-weight:600}dd{margin:4px 0 20px;overflow-wrap:anywhere}a{color:#294d9a}small{color:#596478}nav{display:flex;gap:24px;flex-wrap:wrap}
</style></head><body><main><header><small>Second Horizon</small><h1>운영자 화면</h1></header>${content}</main></body></html>`, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      ...extraHeaders,
    },
  });
}

export async function handleOperatorConsole(request, env) {
  if (request.method !== "GET") return page("<p>이 화면은 조회만 지원합니다.</p>", 405, { allow: "GET" });
  const auth = await requirePlatformOperatorSession(request, env);
  if (!auth.ok) {
    const status = auth.response.status;
    const message = status === 401
      ? '개인 계정으로 로그인한 뒤 이 화면으로 돌아와 주세요. <a href="/app/login">로그인</a>'
      : status === 403 ? "이 계정에는 운영자 화면 접근 권한이 없습니다." : "접근 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    return page(`<section><p>${message}</p><a href="/app">앱으로 이동</a></section>`, status);
  }

  const scheduler = SCHEDULER_MODE === "LEGACY_ACTIVE_RUNTIME_PREPARING"
    ? "기존 자동 실행 유지 · 새 스케줄러 전환 준비 중"
    : SCHEDULER_MODE === "RUNTIME_ACTIVE" ? "새 스케줄러 사용 설정" : "설정 확인 필요";
  return page(`<nav><a href="/app">내 작업공간</a><a href="/operator">새로고침</a></nav>
<section><h2>접근 확인</h2><dl><dt>운영자 사용자 ID</dt><dd>${escapeHtml(auth.operator.userId)}</dd><dt>접근 상태</dt><dd>운영자 권한 확인됨</dd><dt>현재 제공 기능</dt><dd>조회 전용</dd></dl></section>
<section><h2>자동 실행 설정</h2><p>${scheduler}</p><small>현재 실행 코드의 설정입니다. 최근 게시 성공 여부나 외부 서비스 연결 상태는 이 화면에서 확인하지 않습니다.</small></section>
<section><h2>계정 관리</h2><p>내 콘텐츠는 내 작업공간에서 관리합니다. 운영자 권한이 다른 사용자의 작업공간 접근 권한을 부여하지는 않습니다.</p><p>운영자 추가·권한 변경·계정 복구 기능은 아직 제공하지 않습니다.</p></section>`);
}
