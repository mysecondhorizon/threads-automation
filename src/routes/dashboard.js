import { requireAdminSession } from "../middleware/auth.js";
import { getDashboardData } from "../services/dashboard.js";
import { html } from "../utils/response.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function renderMetricCard(label, value, suffix = "") {
  return `
    <article style="
      border:1px solid #ddd;
      border-radius:12px;
      padding:18px;
      background:#fff;
    ">
      <div style="font-size:14px;color:#666;">
        ${escapeHtml(label)}
      </div>

      <div style="
        margin-top:8px;
        font-size:28px;
        font-weight:700;
      ">
        ${escapeHtml(value)}${escapeHtml(suffix)}
      </div>
    </article>
  `;
}

function renderPostRow(post) {
  const preview =
    post.text.length > 80
      ? `${post.text.slice(0, 80)}...`
      : post.text;

  return `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #eee;">
        ${escapeHtml(formatDate(post.publishedAt))}
      </td>

      <td style="
        padding:12px;
        border-bottom:1px solid #eee;
        white-space:pre-wrap;
        min-width:260px;
      ">
        ${escapeHtml(preview)}
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;text-align:right;">
        ${escapeHtml(formatNumber(post.views))}
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;text-align:right;">
        ${escapeHtml(formatNumber(post.likes))}
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;text-align:right;">
        ${escapeHtml(formatNumber(post.replies))}
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;text-align:right;">
        ${escapeHtml(formatNumber(post.interactions))}
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;text-align:right;">
        ${escapeHtml(post.engagementRate.toFixed(2))}%
      </td>
    </tr>
  `;
}

export async function handleDashboard(request, env) {
  const auth = await requireAdminSession(request, env);

  if (!auth.ok) {
    return auth.response;
  }

  const data = await getDashboardData(env);

  const recentRows = data.recentPosts.length
    ? data.recentPosts.map(renderPostRow).join("")
    : `
      <tr>
        <td colspan="7" style="padding:24px;text-align:center;color:#666;">
          아직 게시 데이터가 없습니다.
        </td>
      </tr>
    `;

  const topPosts = data.topPosts.length
    ? data.topPosts
        .map(
          (post, index) => `
            <article style="
              border:1px solid #ddd;
              border-radius:12px;
              padding:16px;
              margin-bottom:12px;
              background:#fff;
            ">
              <div style="font-weight:700;">
                ${index + 1}위 · 조회수 ${escapeHtml(
                  formatNumber(post.views)
                )}
              </div>

              <p style="white-space:pre-wrap;line-height:1.6;">
                ${escapeHtml(post.text || "(내용 없음)")}
              </p>

              <div style="font-size:14px;color:#666;">
                참여율 ${escapeHtml(
                  post.engagementRate.toFixed(2)
                )}% · 반응 ${escapeHtml(
                  formatNumber(post.interactions)
                )}
              </div>
            </article>
          `
        )
        .join("")
    : `<p style="color:#666;">아직 순위를 계산할 데이터가 없습니다.</p>`;

  return html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>Second Horizon Dashboard</title>
</head>

<body style="
  font-family:Arial,sans-serif;
  max-width:1100px;
  margin:40px auto;
  padding:0 20px;
  background:#f7f7f7;
">
  <header style="
    display:flex;
    justify-content:space-between;
    gap:16px;
    align-items:center;
    margin-bottom:28px;
  ">
    <div>
      <h1 style="margin-bottom:8px;">
        Second Horizon Dashboard
      </h1>

      <div style="color:#666;">
        Threads 게시 성과 대시보드
      </div>
    </div>

    <nav style="display:flex;gap:10px;flex-wrap:wrap;">
      <a href="/admin/post">
        <button type="button" style="padding:10px 14px;">
          글 작성
        </button>
      </a>

      <a href="/admin/insights/refresh">
        <button type="button" style="padding:10px 14px;">
          인사이트 갱신
        </button>
      </a>
    </nav>
  </header>

  <section style="
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
    gap:14px;
    margin-bottom:32px;
  ">
    ${renderMetricCard(
      "총 게시물",
      formatNumber(data.summary.totalPosts)
    )}

    ${renderMetricCard(
      "인사이트 수집 게시물",
      formatNumber(data.summary.postsWithInsights)
    )}

    ${renderMetricCard(
      "총 조회수",
      formatNumber(data.summary.totalViews)
    )}

    ${renderMetricCard(
      "평균 조회수",
      formatNumber(data.summary.averageViews)
    )}

    ${renderMetricCard(
      "총 반응",
      formatNumber(data.summary.totalInteractions)
    )}

    ${renderMetricCard(
      "평균 참여율",
      data.summary.averageEngagementRate.toFixed(2),
      "%"
    )}
  </section>

  <section style="margin-bottom:36px;">
    <h2>🏆 상위 게시물</h2>
    ${topPosts}
  </section>

  <section>
    <h2>최근 게시물</h2>

    <div style="
      overflow-x:auto;
      border:1px solid #ddd;
      border-radius:12px;
      background:#fff;
    ">
      <table style="
        width:100%;
        border-collapse:collapse;
        font-size:14px;
      ">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="padding:12px;text-align:left;">게시일</th>
            <th style="padding:12px;text-align:left;">내용</th>
            <th style="padding:12px;text-align:right;">조회수</th>
            <th style="padding:12px;text-align:right;">좋아요</th>
            <th style="padding:12px;text-align:right;">답글</th>
            <th style="padding:12px;text-align:right;">총 반응</th>
            <th style="padding:12px;text-align:right;">참여율</th>
          </tr>
        </thead>

        <tbody>
          ${recentRows}
        </tbody>
      </table>
    </div>
  </section>
</body>
</html>`);
}
