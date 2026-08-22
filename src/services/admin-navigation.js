const effect = (name, tone = "neutral") => ({ name, tone });

export const ADMIN_ENDPOINTS = [
  { method: "GET", path: "/", category: "Public endpoints", label: "Service health", description: "Worker availability text response.", type: "public", auth: false, effects: [effect("READ ONLY")] },
  { method: "GET", path: "/media/:mediaId", category: "Media", label: "Public media binary", description: "Returns an active Media Library object by media ID.", type: "public", auth: false, effects: [effect("PUBLIC"), effect("READ ONLY")] },
  { method: "GET", path: "/connect", category: "Auth/session", label: "OAuth connection page", description: "Starts the account connection flow.", type: "page", auth: false, effects: [effect("READ ONLY")] },
  { method: "GET", path: "/oauth/start", category: "Auth/session", label: "OAuth start", description: "Redirects to Threads authorization.", type: "api", auth: false, effects: [effect("REDIRECT")] },
  { method: "GET", path: "/oauth/callback", category: "Auth/session", label: "OAuth callback", description: "Completes OAuth and stores connection state.", type: "api", auth: false, effects: [effect("KV WRITE")] },
  { method: "GET", path: "/admin/login", category: "Auth/session", label: "Admin login page", description: "Admin session sign-in page.", type: "page", auth: false, effects: [effect("READ ONLY")] },
  { method: "POST", path: "/admin/login", category: "Auth/session", label: "Admin login", description: "Creates an admin session after key verification.", type: "api", auth: false, effects: [effect("KV WRITE")] },
  { method: "GET", path: "/admin", category: "Admin Pages", label: "Admin dashboard", description: "Navigation and feature overview.", type: "page", auth: true, effects: [effect("READ ONLY")] },
  { method: "GET", path: "/admin/endpoints", category: "Admin Pages", label: "Endpoint overview", description: "Read-only registry of Worker endpoints.", type: "page", auth: true, effects: [effect("READ ONLY")] },
  { method: "GET", path: "/admin/post", category: "Admin Pages", label: "Publishing controls", description: "Manual, AUTO, Current Topic, and controlled diagnostics UI.", type: "page", auth: true, effects: [effect("READ ONLY")] },
  { method: "POST", path: "/admin/post", category: "AUTO / publishing", label: "Manual Threads post", description: "Publishes supplied text to Threads.", type: "api", auth: true, effects: [effect("THREADS PUBLISH", "danger"), effect("ACTUAL POST", "danger"), effect("KV WRITE")] },
  { method: "POST", path: "/admin/ai/draft", category: "Admin APIs", label: "AI draft generation", description: "Generates draft options without publishing.", type: "api", auth: true, effects: [effect("AI CALL")] },
  { method: "GET", path: "/admin/context", category: "Admin APIs", label: "Thread context", description: "Returns current publishing context.", type: "api", auth: true, effects: [effect("READ ONLY")] },
  { method: "POST", path: "/admin/auto-post", category: "AUTO / publishing", label: "Manual AUTO publish", description: "Generates and immediately publishes an AUTO post.", type: "api", auth: true, effects: [effect("AI CALL"), effect("THREADS PUBLISH", "danger"), effect("ACTUAL POST", "danger"), effect("KV WRITE")] },
  { method: "GET", path: "/admin/auto-post/status", category: "AUTO / publishing", label: "AUTO execution status", description: "Returns current or recent AUTO execution state.", type: "api", auth: true, effects: [effect("READ ONLY")] },
  { method: "GET, POST", path: "/admin/auto-post/preview", category: "AUTO / publishing", label: "AUTO preview API", description: "Creates a preview without Threads publish.", type: "api", auth: true, effects: [effect("AI CALL")] },
  { method: "GET", path: "/admin/auto-post/preview-page", category: "Admin Pages", label: "AUTO preview page", description: "Review generated content before reviewed publish.", type: "page", auth: true, effects: [effect("READ ONLY")] },
  { method: "POST", path: "/admin/auto-post/publish-reviewed", category: "AUTO / publishing", label: "Publish reviewed AUTO", description: "Publishes an approved preview.", type: "api", auth: true, effects: [effect("THREADS PUBLISH", "danger"), effect("ACTUAL POST", "danger"), effect("KV WRITE")] },
  { method: "GET", path: "/admin/products-page", category: "Admin Pages", label: "Product Catalog page", description: "Product management and CSV import UI.", type: "page", auth: true, effects: [effect("READ ONLY")] },
  { method: "GET, POST, DELETE", path: "/admin/products", category: "Products", label: "Products API", description: "Reads and manages Product Catalog records.", type: "api", auth: true, effects: [effect("KV WRITE")] },
  { method: "POST", path: "/admin/products/batch", category: "Products", label: "Batch Product CSV import", description: "Upserts product catalog rows from CSV.", type: "api", auth: true, effects: [effect("KV WRITE")] },
  { method: "GET", path: "/admin/product-review-page", category: "Admin Pages", label: "Product Review page", description: "Product review test and review UI.", type: "page", auth: true, effects: [effect("READ ONLY")] },
  { method: "GET, POST", path: "/admin/product-reviews", category: "Products", label: "Product Review API", description: "Generates and manages product review candidates.", type: "api", auth: true, effects: [effect("AI CALL"), effect("KV WRITE")] },
  { method: "GET", path: "/admin/media-page", category: "Admin Pages", label: "Media Library page", description: "Media Library, Content Pool, and batch upload UI.", type: "page", auth: true, effects: [effect("READ ONLY")] },
  { method: "GET, PATCH, DELETE", path: "/admin/media", category: "Media", label: "Media Library API", description: "Reads and updates Media Library records.", type: "api", auth: true, effects: [effect("KV WRITE")] },
  { method: "POST", path: "/admin/media/batch", category: "Media", label: "Batch Media upload", description: "Uploads files and registers Media Library records.", type: "api", auth: true, effects: [effect("KV WRITE")] },
  { method: "GET, POST, PATCH, DELETE", path: "/admin/content-pool", category: "Media", label: "Content Pool API", description: "Reads and manages content-pool items.", type: "api", auth: true, effects: [effect("KV WRITE")] },
  { method: "GET", path: "/admin/media-inventory", category: "Media", label: "Weekly media inventory", description: "Returns media and pool coverage status.", type: "api", auth: true, effects: [effect("READ ONLY")] },
  { method: "GET", path: "/admin/schedule-status", category: "Admin APIs", label: "Schedule status", description: "Returns scheduled AUTO execution status.", type: "api", auth: true, effects: [effect("READ ONLY")] },
  { method: "GET", path: "/admin/logs", category: "Admin APIs", label: "Post logs", description: "Returns post log records.", type: "api", auth: true, effects: [effect("READ ONLY")] },
  { method: "GET", path: "/admin/dashboard", category: "Admin Pages", label: "Performance dashboard", description: "Existing post and schedule metrics dashboard.", type: "page", auth: true, effects: [effect("READ ONLY")] },
  { method: "GET", path: "/admin/insights", category: "Admin APIs", label: "Post insights", description: "Fetches and stores Threads insights for a post ID.", type: "api", auth: true, effects: [effect("KV WRITE")] },
  { method: "GET", path: "/admin/insights/refresh", category: "Admin APIs", label: "Refresh insights", description: "Refreshes stored Threads insights.", type: "api", auth: true, effects: [effect("KV WRITE")] },
  { method: "GET", path: "/admin/token", category: "Auth/session", label: "Short token lookup", description: "Returns the stored short-lived token to an authenticated admin session.", type: "api", auth: true, effects: [effect("SENSITIVE RESPONSE", "danger")] },
  { method: "GET", path: "/admin/exchange-token", category: "Auth/session", label: "Long token exchange", description: "Exchanges and stores a long-lived token for an authenticated admin session.", type: "api", auth: true, effects: [effect("KV WRITE"), effect("EXTERNAL API")] },
  { method: "GET", path: "/admin/me", category: "Auth/session", label: "Current Threads profile", description: "Fetches the connected Threads profile and stores refreshed profile metadata for an authenticated admin session.", type: "api", auth: true, effects: [effect("KV WRITE"), effect("EXTERNAL API")] },
  { method: "POST", path: "/admin/diagnostics/ai-selection", category: "Diagnostics", label: "AI Selection diagnostic", description: "Runs one AI candidate selection diagnostic.", type: "diagnostic", auth: true, effects: [effect("AI CALL")] },
  { method: "GET", path: "/admin/diagnostics/current-topics", category: "Diagnostics", label: "Current Topic diagnostic", description: "Reads the saved Current Topic inventory.", type: "diagnostic", auth: true, effects: [effect("READ ONLY")] },
  { method: "POST", path: "/admin/diagnostics/current-topics/refresh", category: "Diagnostics", label: "Current Topic refresh", description: "Discovers current topics and writes a refreshed inventory.", type: "diagnostic", auth: true, effects: [effect("AI CALL"), effect("WEB SEARCH"), effect("KV WRITE")] },
  { method: "GET", path: "/admin/diagnostics/current-topic-auto", category: "Diagnostics", label: "Next AUTO Mode diagnostic", description: "Read-only Current Topic cadence and selection check.", type: "diagnostic", auth: true, effects: [effect("READ ONLY")] },
  { method: "POST", path: "/admin/diagnostics/run-cron-auto-general", category: "Diagnostics", label: "Cron AUTO one-shot diagnostic", description: "Runs the general AUTO engine and creates an actual Threads post.", type: "diagnostic", auth: true, effects: [effect("AI CALL"), effect("THREADS PUBLISH", "danger"), effect("ACTUAL POST", "danger"), effect("KV WRITE")] },
];

export const ADMIN_NAVIGATION = [
  ["Dashboard", "/admin"],
  ["Publishing", "/admin/post"],
  ["Media", "/admin/media-page"],
  ["Products", "/admin/products-page"],
  ["Diagnostics / Endpoints", "/admin/endpoints"],
];

export function renderAdminNavigation(activePath = "") {
  return `<nav aria-label="Admin navigation" style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 24px;padding:12px;border:1px solid #ddd;border-radius:10px;background:#fff;">
    ${ADMIN_NAVIGATION.map(([label, path]) => `<a href="${path}" style="padding:8px 11px;border-radius:7px;text-decoration:none;color:#111;background:${activePath === path ? "#e8eefc" : "#f6f6f6"};font-weight:${activePath === path ? "700" : "400"};">${label}</a>`).join("")}
  </nav>`;
}
