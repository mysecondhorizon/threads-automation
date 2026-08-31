import { resolveCurrentSession } from "../middleware/auth.js";
import {
  AppContextError,
  resolveCurrentAppContext,
  selectCurrentWorkspace,
} from "../services/app-context.js";
import {
  APP_NAVIGATION,
  getAppNavigationItem,
} from "../services/app-navigation.js";
import { html } from "../utils/response.js";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderNavigation(activePath) {
  return APP_NAVIGATION.map((item) => {
    const active = item.path === activePath;
    return `<a class="app-nav-link${active ? " is-active" : ""}" href="${item.path}"${active ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`;
  }).join("");
}

function renderWorkspaceContext(appContext) {
  if (!appContext || appContext.legacy) return "";

  const { user, currentWorkspace, workspaces } = appContext;
  const workspaceStatus = currentWorkspace
    ? `Current Workspace: <strong>${escapeHtml(currentWorkspace.name)}</strong>`
    : workspaces.length
      ? "Select a workspace to establish your app context."
      : "No workspace available.";
  const selector = workspaces.length
    ? `<form class="app-workspace-form" method="POST" action="/app/workspace">
        <label for="app-workspace-id">Workspace</label>
        <select id="app-workspace-id" name="workspaceId">
          ${workspaces.map((workspace) => `<option value="${escapeHtml(workspace.id)}"${workspace.id === currentWorkspace?.id ? " selected" : ""}>${escapeHtml(workspace.name)}</option>`).join("")}
        </select>
        <button type="submit">Select</button>
      </form>`
    : "";
  const threadsConnection = currentWorkspace
    ? `<form class="app-workspace-form" method="POST" action="/app/connected-accounts/threads/start">
        <button type="submit">Connect Threads account</button>
      </form>`
    : "";
  const logout = `<form class="app-workspace-form" method="POST" action="/app/logout">
      <button type="submit">Logout</button>
    </form>`;

  return `<section class="app-workspace-context" aria-label="Current workspace">
    <strong>${escapeHtml(user.displayName)}</strong>
    <p>${workspaceStatus}</p>
    ${selector}
    ${threadsConnection}
    ${logout}
  </section>`;
}

function renderStyles() {
  return `<style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f6f8; color: #1d2433; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f6f8; }
    a { color: inherit; }
    .app-layout { min-height: 100vh; display: grid; grid-template-columns: 240px minmax(0, 1fr); }
    .app-sidebar { padding: 28px 16px; background: #fff; border-right: 1px solid #e5e8ee; }
    .app-brand { display: block; padding: 0 12px 24px; text-decoration: none; font-size: 18px; font-weight: 760; letter-spacing: -0.02em; }
    .app-brand small { display: block; margin-top: 4px; color: #697386; font-size: 12px; font-weight: 600; letter-spacing: 0; }
    .app-navigation { display: grid; gap: 4px; }
    .app-workspace-context { display:grid; gap:8px; margin:0 0 18px; padding:12px; border:1px solid #d9e2f5; border-radius:10px; background:#f7f9ff; color:#344054; font-size:13px; line-height:1.45; }
    .app-workspace-context strong, .app-workspace-context p { margin:0; }
    .app-workspace-form { display:grid; gap:7px; }
    .app-workspace-form select, .app-workspace-form button { width:100%; border:1px solid #cfd6e2; border-radius:7px; background:#fff; color:#344054; font:inherit; padding:8px; }
    .app-workspace-form button { cursor:pointer; font-weight:700; }
    .app-nav-link { padding: 10px 12px; border-radius: 9px; color: #586174; font-size: 14px; font-weight: 650; text-decoration: none; }
    .app-nav-link:hover { background: #f1f3f6; color: #1d2433; }
    .app-nav-link.is-active { background: #e9eefb; color: #294d9a; }
    .app-main { min-width: 0; padding: 44px clamp(20px, 5vw, 72px); }
    .app-content { width: min(100%, 1120px); margin: 0 auto; }
    .app-eyebrow { margin: 0 0 8px; color: #667085; font-size: 13px; font-weight: 700; }
    h1 { margin: 0; font-size: clamp(30px, 4vw, 42px); letter-spacing: -0.04em; line-height: 1.15; }
    .app-description { max-width: 680px; margin: 14px 0 32px; color: #5e6879; font-size: 16px; line-height: 1.65; }
    .app-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; }
    .app-card { display: block; min-height: 164px; padding: 22px; border: 1px solid #e2e6ec; border-radius: 14px; background: #fff; text-decoration: none; box-shadow: 0 1px 2px rgb(16 24 40 / 0.03); }
    .app-card:hover { border-color: #b8c6e6; box-shadow: 0 8px 22px rgb(28 52 99 / 0.08); transform: translateY(-1px); }
    .app-card h2 { margin: 0 0 10px; font-size: 18px; letter-spacing: -0.02em; }
    .app-card p { margin: 0; color: #5e6879; font-size: 14px; line-height: 1.6; }
    .app-empty { max-width: 680px; padding: 28px; border: 1px solid #e2e6ec; border-radius: 14px; background: #fff; color: #5e6879; line-height: 1.65; }
    .app-empty strong { display: block; margin-bottom: 6px; color: #1d2433; font-size: 16px; }
    @media (max-width: 760px) {
      .app-layout { display: block; }
      .app-sidebar { position: sticky; top: 0; z-index: 1; padding: 12px 16px; border-right: 0; border-bottom: 1px solid #e5e8ee; }
      .app-brand { padding: 0 0 10px; font-size: 15px; }
      .app-brand small { display: none; }
      .app-navigation { display: flex; flex-wrap: wrap; gap: 4px; }
      .app-nav-link { padding: 8px 10px; white-space: nowrap; }
      .app-main { padding: 32px 20px 48px; }
    }
  </style>`;
}

export function renderAppShell({ activePath, title, description, content, appContext = null, status = 200 }) {
  return html(`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} · Second Horizon</title>
    ${renderStyles()}
  </head>
  <body>
    <div class="app-layout">
      <aside class="app-sidebar">
        <a class="app-brand" href="/app">Second Horizon<small>운영 콘솔</small></a>
        ${renderWorkspaceContext(appContext)}
        <nav class="app-navigation" aria-label="운영 메뉴">${renderNavigation(activePath)}</nav>
      </aside>
      <main class="app-main">
        <div class="app-content">
          <p class="app-eyebrow">운영 콘솔</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="app-description">${escapeHtml(description)}</p>
          ${content}
        </div>
      </main>
    </div>
  </body>
</html>`, status);
}

async function requireAppSession(request, env) {
  const current = await resolveCurrentSession(request, env);
  if (!current) {
    return {
      ok: false,
      response: Response.redirect(
        new URL("/app/login", request.url).toString(),
        302,
      ),
    };
  }
  return {
    ok: true,
    sessionId: current.sessionId,
    session: current.session,
    user: current.user,
  };
}

export async function handleAppHome(request, env) {
  const auth = await requireAppSession(request, env);
  if (!auth.ok) return auth.response;

  const appContext = await resolveCurrentAppContext(request, env);
  const connectionResult = new URL(request.url).searchParams.get("threadsConnection");
  const connectionFeedback = connectionResult === "success"
    ? `<p class="app-empty" role="status">Threads account connection completed.</p>`
    : connectionResult === "failed"
      ? `<p class="app-empty" role="status">Threads account connection could not be completed.</p>`
      : "";
  const cards = APP_NAVIGATION
    .filter((item) => item.path !== "/app")
    .map((item) => `<a class="app-card" href="${item.path}"><h2>${escapeHtml(item.label)}</h2><p>${escapeHtml(item.description)}</p></a>`)
    .join("") + connectionFeedback;

  return renderAppShell({
    activePath: "/app",
    title: "운영 홈",
    description: "콘텐츠 운영에 필요한 작업을 한곳에서 시작하세요.",
    content: `<section class="app-card-grid" aria-label="운영 기능">${cards}</section>`,
    appContext,
  });
}

export async function handleAppWorkspaceSelection(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "POST", "cache-control": "no-store" },
    });
  }

  try {
    const workspaceId = (await request.formData()).get("workspaceId");
    await selectCurrentWorkspace(request, env, workspaceId);
  } catch (error) {
    const status = error instanceof AppContextError &&
      error.code !== "workspace_selection_unauthenticated"
      ? 400
      : 401;
    return new Response("Workspace selection is not available.", {
      status,
      headers: { "cache-control": "no-store" },
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: "/app",
      "cache-control": "no-store",
    },
  });
}

export function renderAppWorkspaceUnavailable(appContext, path) {
  const page = getAppNavigationItem(path);
  return renderAppShell({
    activePath: page?.path || "/app",
    title: page?.label || "Workspace",
    description: page?.description || "Workspace context is active.",
    appContext,
    content: `<section class="app-empty"><strong>Workspace data access is not available yet.</strong>Existing app data operations remain in the legacy Default Workspace and are blocked for this selected Workspace.</section>`,
    status: 409,
  });
}

export async function handleAppPlaceholderPage(request, env, path) {
  const auth = await requireAppSession(request, env);
  if (!auth.ok) return auth.response;

  const page = getAppNavigationItem(path);
  if (!page || path === "/app") {
    return new Response("Not Found", { status: 404 });
  }

  return renderAppShell({
    activePath: page.path,
    title: page.label,
    description: page.description,
    content: `<section class="app-empty"><strong>준비 중</strong>이 작업 공간은 다음 단계에서 운영 기능과 연결됩니다.</section>`,
  });
}
