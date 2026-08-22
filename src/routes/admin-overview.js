import { requireAdminSession } from "../middleware/auth.js";
import { ADMIN_ENDPOINTS, renderAdminNavigation } from "../services/admin-navigation.js";
import { html } from "../utils/response.js";

const CATEGORY_ORDER = ["Admin Pages", "AUTO / publishing", "Media", "Products", "Diagnostics", "Admin APIs", "Auth/session", "Public endpoints"];
const card = (title, description, href) => `<a href="${href}" style="display:block;padding:16px;border:1px solid #ddd;border-radius:12px;background:#fff;color:#111;text-decoration:none;"><strong>${title}</strong><div style="margin-top:7px;color:#555;font-size:14px;line-height:1.5;">${description}</div></a>`;
const badge = ({ name, tone }) => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:3px 6px;border-radius:999px;font-size:11px;font-weight:700;background:${tone === "danger" ? "#ffe1e1" : "#edf1f5"};color:${tone === "danger" ? "#9b0000" : "#334"};">${name}</span>`;

function pageShell(title, activePath, content) {
  return html(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;max-width:1120px;margin:32px auto;padding:0 18px;background:#f7f7f7;color:#202124;">${renderAdminNavigation(activePath)}${content}</body></html>`);
}

export async function handleAdminHomePage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;
  const content = `<header style="margin-bottom:24px;"><h1 style="margin:0 0 8px;">Second Horizon Admin</h1><p style="margin:0;color:#555;">관리 기능과 안전한 진단 경로를 한곳에서 찾습니다.</p></header>
  <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
    ${card("Publishing", "AUTO / Post controls and manual publishing.", "/admin/post")}
    ${card("AUTO Preview", "Generate a review-only AUTO preview before publishing.", "/admin/auto-post/preview-page")}
    ${card("Current Topic controls", "Current Topic 조회, Refresh, AUTO Preview, and one-shot Cron AUTO controls.", "/admin/post")}
    ${card("Media", "Media Library, batch upload, Content Pool, inventory.", "/admin/media-page")}
    ${card("Products", "Product Catalog, CSV import, and review workflow.", "/admin/products-page")}
    ${card("AI Selection diagnostic", "Review the diagnostic endpoint and its AI-call effect label.", "/admin/endpoints#Diagnostics")}
    ${card("Next AUTO Mode diagnostic", "Read-only Current Topic cadence diagnostic details.", "/admin/endpoints#Diagnostics")}
    ${card("System", "Endpoint Overview and connected profile/session checks.", "/admin/endpoints#Auth-session")}
  </section>
  <section style="margin-top:24px;padding:18px;border:1px solid #ddd;border-radius:12px;background:#fff;"><h2 style="margin-top:0;">Quick links</h2><a href="/admin/auto-post/preview-page">AUTO Preview</a> · <a href="/admin/dashboard">Performance dashboard</a> · <a href="/admin/me">Current profile/session check</a></section>`;
  return pageShell("Second Horizon Admin", "/admin", content);
}

export async function handleEndpointOverviewPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;
  const sections = CATEGORY_ORDER.map((category) => {
    const endpoints = ADMIN_ENDPOINTS.filter((entry) => entry.category === category);
    if (!endpoints.length) return "";
    return `<section id="${category.replace(/[^a-zA-Z0-9]+/g, "-")}" style="margin:24px 0;"><h2>${category}</h2><div style="overflow-x:auto;border:1px solid #ddd;border-radius:12px;background:#fff;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="background:#f0f2f5;"><th style="padding:10px;text-align:left;">Method</th><th style="padding:10px;text-align:left;">Path / label</th><th style="padding:10px;text-align:left;">Description</th><th style="padding:10px;text-align:left;">Access / effects</th></tr></thead><tbody>${endpoints.map((entry) => `<tr style="border-top:1px solid #eee;"><td style="padding:10px;vertical-align:top;font-weight:700;white-space:nowrap;">${entry.method}</td><td style="padding:10px;vertical-align:top;"><code>${entry.path}</code><div style="margin-top:5px;font-weight:700;">${entry.label}</div></td><td style="padding:10px;vertical-align:top;color:#555;">${entry.description}</td><td style="padding:10px;vertical-align:top;">${entry.auth ? "ADMIN ONLY" : "PUBLIC"}<div style="margin-top:5px;">${entry.effects.map(badge).join("")}</div></td></tr>`).join("")}</tbody></table></div></section>`;
  }).join("");
  return pageShell("Endpoint Overview", "/admin/endpoints", `<header><h1 style="margin:0 0 8px;">Endpoint Overview</h1><p style="margin:0;color:#555;">페이지 로드는 read-only입니다. API는 이 화면에서 실행하지 않으며, controls는 Publishing으로 이동해 사용합니다.</p></header>${sections}`);
}
