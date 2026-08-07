import {
  getLatestScheduleRun,
  getScheduleRuns,
} from "../services/auto-post/schedule-store.js";

import {
  requireAdminSession,
} from "../middleware/auth.js";

import {
  getDashboardData,
} from "../services/dashboard.js";

import {
  getAutoPostStatus,
} from "../services/auto-post-engine.js";

import {
  html,
} from "../utils/response.js";

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function formatDate(
  value
) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return date.toLocaleString(
    "ko-KR",
    {
      timeZone:
        "Asia/Seoul",

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit",

      hour:
        "2-digit",

      minute:
        "2-digit",
    }
  );
}

function formatNumber(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    "ko-KR"
  );
}

function formatBoolean(
  value
) {
  return value
    ? "예"
    : "아니요";
}

function formatExecutionStatus(
  value
) {
  const statusMap = {
    starting:
      "시작 중",

    running:
      "실행 중",

    completed:
      "완료",

    failed:
      "실패",
  };

  return (
    statusMap[value] ||
    value ||
    "-"
  );
}

function formatExecutionStep(
  value
) {
  const stepMap = {
    initializing:
      "초기화",

    loading_auth:
      "Threads 인증 확인",

    building_context:
      "게시 컨텍스트 생성",

    generating_content:
      "AI 본문 생성",

    validating_content:
      "본문 검증",

    publishing:
      "Threads 게시",

    completed:
      "완료",

    validation:
      "본문 검증 실패",

    ai_generation:
      "AI 생성 실패",

    get_profile:
      "Threads 프로필 조회",

    create_container:
      "게시 컨테이너 생성",

    publish:
      "본문 게시",

    create_reply_container:
      "첫 댓글 컨테이너 생성",

    publish_reply:
      "첫 댓글 게시",

    lock:
      "중복 실행 잠금",

    unexpected_auto_post_error:
      "예상하지 못한 오류",
  };

  return (
    stepMap[value] ||
    value ||
    "-"
  );
}

function renderMetricCard(
  label,
  value,
  suffix = ""
) {
  return `
    <article style="
      border:1px solid #ddd;
      border-radius:12px;
      padding:18px;
      background:#fff;
    ">
      <div style="
        font-size:14px;
        color:#666;
      ">
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

function renderInfoItem(
  label,
  value
) {
  return `
    <div style="
      border-bottom:1px solid #eee;
      padding:12px 0;
    ">
      <div style="
        color:#666;
        font-size:13px;
        margin-bottom:5px;
      ">
        ${escapeHtml(label)}
      </div>

      <div style="
        font-size:15px;
        line-height:1.6;
        white-space:pre-wrap;
        word-break:break-word;
      ">
        ${escapeHtml(
          value || "-"
        )}
      </div>
    </div>
  `;
}

function renderPostRow(
  post
) {
  const text =
    String(
      post.text || ""
    );

  const preview =
    text.length > 80
      ? `${text.slice(0, 80)}...`
      : text;

  const engagementRate =
    Number(
      post.engagementRate || 0
    );

  return `
    <tr>
      <td style="
        padding:12px;
        border-bottom:1px solid #eee;
      ">
        ${escapeHtml(
          formatDate(
            post.publishedAt
          )
        )}
      </td>

      <td style="
        padding:12px;
        border-bottom:1px solid #eee;
        white-space:pre-wrap;
        min-width:260px;
      ">
        ${escapeHtml(
          preview
        )}
      </td>

      <td style="
        padding:12px;
        border-bottom:1px solid #eee;
        text-align:right;
      ">
        ${escapeHtml(
          formatNumber(
            post.views
          )
        )}
      </td>

      <td style="
        padding:12px;
        border-bottom:1px solid #eee;
        text-align:right;
      ">
        ${escapeHtml(
          formatNumber(
            post.likes
          )
        )}
      </td>

      <td style="
        padding:12px;
        border-bottom:1px solid #eee;
        text-align:right;
      ">
        ${escapeHtml(
          formatNumber(
            post.replies
          )
        )}
      </td>

      <td style="
        padding:12px;
        border-bottom:1px solid #eee;
        text-align:right;
      ">
        ${escapeHtml(
          formatNumber(
            post.interactions
          )
        )}
      </td>

      <td style="
        padding:12px;
        border-bottom:1px solid #eee;
        text-align:right;
      ">
        ${escapeHtml(
          engagementRate.toFixed(
            2
          )
        )}%
      </td>
    </tr>
  `;
}

function renderAutoPostStatusCard(
  autoPostStatus,
  statusError
) {
  if (statusError) {
    return `
      <section style="
        margin-bottom:36px;
      ">
        <h2>
          자동 게시 상태
        </h2>

        <article style="
          border:1px solid #f1b3b3;
          border-radius:12px;
          padding:18px;
          background:#fff5f5;
        ">
          <div style="
            font-weight:700;
            color:#b00020;
          ">
            자동 게시 상태를 불러오지 못했습니다.
          </div>

          <div style="
            margin-top:8px;
            color:#666;
            white-space:pre-wrap;
          ">
            ${escapeHtml(
              statusError
            )}
          </div>
        </article>
      </section>
    `;
  }
  
  function renderScheduleStatusCard(
    scheduleData,
    scheduleError
  ) {
    if (
      scheduleError
    ) {
      return `
        <section style="
          margin-bottom:36px;
        ">
          <h2>
            예약 게시 상태
          </h2>
  
          <article style="
            border:1px solid #f1b3b3;
            border-radius:12px;
            padding:18px;
            background:#fff5f5;
          ">
            예약 게시 이력을 불러오지 못했습니다.
  
            <div style="
              margin-top:8px;
              color:#666;
            ">
              ${escapeHtml(
                scheduleError
              )}
            </div>
          </article>
        </section>
      `;
    }

    const latestRun =
      scheduleData
        ?.latestRun ||
      null;
  
    if (
      !latestRun
    ) {
      return `
        <section style="
          margin-bottom:36px;
        ">
          <h2>
            예약 게시 상태
          </h2>
  
          <article style="
            border:1px solid #ddd;
            border-radius:12px;
            padding:18px;
            background:#fff;
          ">
            아직 Cron 실행 기록이 없습니다.
          </article>
        </section>
      `;
    }
  
    const generation =
      latestRun
        .generation || {
        attempts:
          0,
  
        regenerated:
          false,
      };
  
    const similarity =
      latestRun
        .similarity || {
        checkedPostCount:
          0,
  
        threshold:
          0,
  
        highestScore:
          0,
  
        matchedPostId:
          null,
      };
  
    const skipReason =
      latestRun.skipReason
        ? JSON.stringify(
            latestRun
              .skipReason,
            null,
            2
          )
        : "-";
  
    const error =
      latestRun.error
        ? JSON.stringify(
            latestRun.error,
            null,
            2
          )
        : "-";
  
    return `
      <section style="
        margin-bottom:36px;
      ">
        <h2>
          예약 게시 상태
        </h2>
  
        <div style="
          display:grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(180px,1fr)
            );
          gap:14px;
          margin-bottom:14px;
        ">
          ${renderMetricCard(
            "Cron 상태",
            latestRun.status
          )}
  
          ${renderMetricCard(
            "건너뜀",
            formatBoolean(
              latestRun.skipped
            )
          )}
  
          ${renderMetricCard(
            "생성 시도",
            formatNumber(
              generation.attempts
            ),
            "회"
          )}
  
          ${renderMetricCard(
            "재생성",
            formatBoolean(
              generation.regenerated
            )
          )}
  
          ${renderMetricCard(
            "최고 유사도",
            formatSimilarity(
              similarity
                .highestScore
            )
          )}
        </div>
  
        <article style="
          border:1px solid #ddd;
          border-radius:12px;
          padding:18px;
          background:#fff;
        ">
          ${renderInfoItem(
            "Cron",
            latestRun.cron
          )}
  
          ${renderInfoItem(
            "실행 시작",
            formatDate(
              latestRun.startedAt
            )
          )}
  
          ${renderInfoItem(
            "실행 완료",
            formatDate(
              latestRun.completedAt
            )
          )}
  
          ${renderInfoItem(
            "Execution ID",
            latestRun.executionId
          )}
  
          ${renderInfoItem(
            "Post ID",
            latestRun.postId
          )}
  
          ${renderInfoItem(
            "비교 게시물 수",
            similarity
              .checkedPostCount
              ? `${similarity.checkedPostCount}개`
              : "-"
          )}
  
          ${renderInfoItem(
            "가장 유사한 게시물 ID",
            similarity
              .matchedPostId
          )}
  
          ${renderInfoItem(
            "스킵 사유",
            skipReason
          )}
  
          ${renderInfoItem(
            "오류",
            error
          )}
        </article>
      </section>
    `;
  }

  const latestExecution =
    autoPostStatus
      ?.latestExecution ||
    null;

  const activeExecution =
    autoPostStatus
      ?.activeExecution ||
    null;

  if (!latestExecution) {
    return `
      <section style="
        margin-bottom:36px;
      ">
        <h2>
          자동 게시 상태
        </h2>

        <article style="
          border:1px solid #ddd;
          border-radius:12px;
          padding:18px;
          background:#fff;
        ">
          <div style="
            font-weight:700;
          ">
            아직 자동 게시 실행 기록이 없습니다.
          </div>

          <div style="
            margin-top:8px;
            color:#666;
          ">
            자동 게시를 실행하면 최근 실행 결과와 첫 댓글 상태가 여기에 표시됩니다.
          </div>
        </article>
      </section>
    `;
  }

  const firstComment =
    latestExecution
      .firstComment || {
      requested:
        false,

      published:
        false,

      replyId:
        null,

      text:
        "",

      error:
        null,
    };

  const executionError =
    latestExecution.error
      ? JSON.stringify(
          latestExecution.error,
          null,
          2
        )
      : "-";

  const firstCommentError =
    firstComment.error
      ? JSON.stringify(
          firstComment.error,
          null,
          2
        )
      : "-";

  return `
    <section style="
      margin-bottom:36px;
    ">
      <h2>
        자동 게시 상태
      </h2>

      <div style="
        display:grid;
        grid-template-columns:
          repeat(
            auto-fit,
            minmax(220px, 1fr)
          );
        gap:14px;
        margin-bottom:14px;
      ">
        ${renderMetricCard(
          "현재 실행 중",
          formatBoolean(
            autoPostStatus
              ?.isRunning
          )
        )}

        ${renderMetricCard(
          "최근 실행 상태",
          formatExecutionStatus(
            latestExecution
              .status
          )
        )}

        ${renderMetricCard(
          "최근 실행 단계",
          formatExecutionStep(
            latestExecution
              .step
          )
        )}

        ${renderMetricCard(
          "본문 길이",
          formatNumber(
            latestExecution
              .textLength
          ),
          latestExecution
            .textLength
            ? "자"
            : ""
        )}
      </div>

      <article style="
        border:1px solid #ddd;
        border-radius:12px;
        padding:18px;
        background:#fff;
        margin-bottom:14px;
      ">
        <h3 style="
          margin-top:0;
          margin-bottom:6px;
        ">
          최근 자동 게시 실행
        </h3>

        ${renderInfoItem(
          "실행 ID",
          latestExecution.id
        )}

        ${renderInfoItem(
          "실행 시작",
          formatDate(
            latestExecution
              .startedAt
          )
        )}

        ${renderInfoItem(
          "마지막 갱신",
          formatDate(
            latestExecution
              .updatedAt
          )
        )}

        ${renderInfoItem(
          "실행 완료",
          formatDate(
            latestExecution
              .completedAt
          )
        )}

        ${renderInfoItem(
          "Threads 사용자",
          latestExecution
            .username
        )}

        ${renderInfoItem(
          "본문 게시 ID",
          latestExecution
            .postId
        )}

        ${renderInfoItem(
          "현재 활성 실행 ID",
          activeExecution
            ?.executionId
        )}

        ${renderInfoItem(
          "현재 활성 실행 시작",
          formatDate(
            activeExecution
              ?.startedAt
          )
        )}

        ${renderInfoItem(
          "실행 오류",
          executionError
        )}
      </article>

      <article style="
        border:1px solid #ddd;
        border-radius:12px;
        padding:18px;
        background:#fff;
      ">
        <h3 style="
          margin-top:0;
          margin-bottom:6px;
        ">
          첫 댓글
        </h3>

        ${renderInfoItem(
          "댓글 요청됨",
          formatBoolean(
            firstComment
              .requested
          )
        )}

        ${renderInfoItem(
          "댓글 게시 성공",
          formatBoolean(
            firstComment
              .published
          )
        )}

        ${renderInfoItem(
          "댓글 Reply ID",
          firstComment
            .replyId
        )}

        ${renderInfoItem(
          "댓글 내용",
          firstComment
            .text
        )}

        ${renderInfoItem(
          "댓글 오류",
          firstCommentError
        )}
      </article>
    </section>
  `;
}

export async function handleDashboard(
  request,
  env
) {
  const auth =
    await requireAdminSession(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  const [
    dashboardResult,
    autoPostResult,
    scheduleResult,
  ] = await Promise.allSettled([
    getDashboardData(
      env
    ),
  
    getAutoPostStatus(
      env
    ),
  
    Promise.all([
      getLatestScheduleRun(
        env
      ),
  
      getScheduleRuns(
        env,
        5
      ),
    ]),
  ]);

  if (
    dashboardResult.status ===
    "rejected"
  ) {
    console.error(
      "Dashboard data lookup failed",
      dashboardResult.reason
    );

    return html(
      `<!DOCTYPE html>
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
  max-width:900px;
  margin:40px auto;
  padding:0 20px;
  background:#f7f7f7;
">
  <h1>
    Second Horizon Dashboard
  </h1>

  <article style="
    border:1px solid #f1b3b3;
    border-radius:12px;
    padding:18px;
    background:#fff5f5;
  ">
    <div style="
      font-weight:700;
      color:#b00020;
    ">
      대시보드 데이터를 불러오지 못했습니다.
    </div>

    <div style="
      margin-top:8px;
      color:#666;
    ">
      잠시 후 다시 시도해 주세요.
    </div>
  </article>
</body>
</html>`,
      500
    );
  }

  const data =
    dashboardResult.value;

  const autoPostStatus =
    autoPostResult.status ===
    "fulfilled"
      ? autoPostResult.value
      : null;

  const autoPostStatusError =
    autoPostResult.status ===
    "rejected"
      ? autoPostResult.reason
          instanceof Error
        ? autoPostResult.reason
            .message
        : String(
            autoPostResult.reason
          )
      : null;

  if (
    autoPostResult.status ===
    "rejected"
  ) {
    console.error(
      "Auto post dashboard status lookup failed",
      autoPostResult.reason
    );
  }
  
  const scheduleData =
    scheduleResult.status ===
    "fulfilled"
      ? {
          latestRun:
            scheduleResult
              .value[0],
  
          runs:
            scheduleResult
              .value[1],
        }
      : {
          latestRun:
            null,
  
          runs:
            [],
        };
  
  const scheduleError =
    scheduleResult.status ===
    "rejected"
      ? (
          scheduleResult.reason
            instanceof Error
            ? scheduleResult
                .reason
                .message
            : String(
                scheduleResult
                  .reason
              )
        )
      : null;

  const recentRows =
    data.recentPosts.length
      ? data.recentPosts
          .map(
            renderPostRow
          )
          .join("")
      : `
        <tr>
          <td
            colspan="7"
            style="
              padding:24px;
              text-align:center;
              color:#666;
            "
          >
            아직 게시 데이터가 없습니다.
          </td>
        </tr>
      `;

  const topPosts =
    data.topPosts.length
      ? data.topPosts
          .map(
            (
              post,
              index
            ) => {
              const engagementRate =
                Number(
                  post
                    .engagementRate ||
                  0
                );

              return `
                <article style="
                  border:1px solid #ddd;
                  border-radius:12px;
                  padding:16px;
                  margin-bottom:12px;
                  background:#fff;
                ">
                  <div style="
                    font-weight:700;
                  ">
                    ${index + 1}위 · 조회수 ${escapeHtml(
                      formatNumber(
                        post.views
                      )
                    )}
                  </div>

                  <p style="
                    white-space:pre-wrap;
                    line-height:1.6;
                  ">
                    ${escapeHtml(
                      post.text ||
                      "(내용 없음)"
                    )}
                  </p>

                  <div style="
                    font-size:14px;
                    color:#666;
                  ">
                    참여율 ${escapeHtml(
                      engagementRate
                        .toFixed(
                          2
                        )
                    )}% · 반응 ${escapeHtml(
                      formatNumber(
                        post.interactions
                      )
                    )}
                  </div>
                </article>
              `;
            }
          )
          .join("")
      : `
        <p style="
          color:#666;
        ">
          아직 순위를 계산할 데이터가 없습니다.
        </p>
      `;

  return html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>
    Second Horizon Dashboard
  </title>
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
      <h1 style="
        margin-bottom:8px;
      ">
        Second Horizon Dashboard
      </h1>

      <div style="
        color:#666;
      ">
        Threads 게시 성과 및 자동 게시 상태
      </div>
    </div>

    <nav style="
      display:flex;
      gap:10px;
      flex-wrap:wrap;
    ">
      <a href="/admin/post">
        <button
          type="button"
          style="
            padding:10px 14px;
          "
        >
          글 작성
        </button>
      </a>

      <a href="/admin/insights/refresh">
        <button
          type="button"
          style="
            padding:10px 14px;
          "
        >
          인사이트 갱신
        </button>
      </a>

      <a href="/admin/auto-post/status">
        <button
          type="button"
          style="
            padding:10px 14px;
          "
        >
          상태 JSON
        </button>
      </a>
    </nav>
  </header>

  <section style="
    display:grid;
    grid-template-columns:
      repeat(
        auto-fit,
        minmax(180px, 1fr)
      );
    gap:14px;
    margin-bottom:32px;
  ">
    ${renderMetricCard(
      "총 게시물",
      formatNumber(
        data.summary
          .totalPosts
      )
    )}

    ${renderMetricCard(
      "인사이트 수집 게시물",
      formatNumber(
        data.summary
          .postsWithInsights
      )
    )}

    ${renderMetricCard(
      "총 조회수",
      formatNumber(
        data.summary
          .totalViews
      )
    )}

    ${renderMetricCard(
      "평균 조회수",
      formatNumber(
        data.summary
          .averageViews
      )
    )}

    ${renderMetricCard(
      "총 반응",
      formatNumber(
        data.summary
          .totalInteractions
      )
    )}

    ${renderMetricCard(
      "평균 참여율",
      Number(
        data.summary
          .averageEngagementRate ||
        0
      ).toFixed(
        2
      ),
      "%"
    )}
  </section>

  ${renderAutoPostStatusCard(
    autoPostStatus,
    autoPostStatusError
  )}

  ${renderScheduleStatusCard(
    scheduleData,
    scheduleError
  )}

  <section style="
    margin-bottom:36px;
  ">
    <h2>
      🏆 상위 게시물
    </h2>

    ${topPosts}
  </section>

  <section>
    <h2>
      최근 게시물
    </h2>

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
          <tr style="
            background:#f0f0f0;
          ">
            <th style="
              padding:12px;
              text-align:left;
            ">
              게시일
            </th>

            <th style="
              padding:12px;
              text-align:left;
            ">
              내용
            </th>

            <th style="
              padding:12px;
              text-align:right;
            ">
              조회수
            </th>

            <th style="
              padding:12px;
              text-align:right;
            ">
              좋아요
            </th>

            <th style="
              padding:12px;
              text-align:right;
            ">
              답글
            </th>

            <th style="
              padding:12px;
              text-align:right;
            ">
              총 반응
            </th>

            <th style="
              padding:12px;
              text-align:right;
            ">
              참여율
            </th>
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