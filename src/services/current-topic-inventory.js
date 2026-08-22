import {
  getJson,
  putJson,
} from "./kv.js";

import {
  requestOpenAiJson,
} from "./ai.js";

export const CURRENT_TOPIC_INVENTORY_KEY =
  "current_topic_inventory:v1";

const INVENTORY_VERSION = 1;
const DEFAULT_TTL_HOURS = 36;
const MAX_TOPICS = 12;
const MAX_FACTS = 3;
const MAX_ANGLES = 4;
const MAX_CLAIMS = 5;
const MAX_SOURCES = 3;

const ALLOWED_CATEGORIES = new Set([
  "ai_digital",
  "apps_services",
  "devices",
  "work_productivity",
  "consumer_lifestyle",
  "seasonal_life",
  "light_culture",
]);

const BASE_FORBIDDEN_CLAIMS = [
  "Do not claim direct personal use or experience unless the supplied context explicitly confirms it.",
  "Do not add unsupported numbers, dates, launch details, or certainty.",
  "Do not present uncertain facts as confirmed.",
];

const CATEGORY_RELATABILITY = {
  ai_digital: 7,
  apps_services: 10,
  devices: 9,
  work_productivity: 11,
  consumer_lifestyle: 15,
  seasonal_life: 14,
  light_culture: 8,
};

const DAILY_LIFE_SIGNALS = [
  "daily", "life", "work", "office", "home", "shopping", "price",
  "delivery", "reservation", "season", "holiday", "commute", "phone",
  "app", "service", "payment", "consumer", "food", "일상", "생활",
  "직장", "회사", "집", "장보기", "가격", "배송", "예약", "계절",
  "휴일", "명절", "출근", "퇴근", "스마트폰", "앱", "서비스", "결제",
  "소비", "식사", "과일",
];

const CONVERSATION_SIGNALS = [
  "benefit", "pain", "choice", "question", "compare", "change", "habit",
  "friction", "save", "convenient", "불편", "고민", "선택", "질문", "비교",
  "바뀌", "습관", "절약", "편하", "문제", "체감", "궁금",
];

const PRACTICAL_HOOK_SIGNALS = [
  "time", "cost", "price", "reservation", "delivery", "mistake", "problem",
  "save", "change", "불편", "시간", "비용", "가격", "예약", "배송", "실수",
  "문제", "절약", "바뀌", "체감",
];

const PRESS_RELEASE_SIGNALS = [
  "press release", "b2b", "developer", "api", "platform", "enterprise",
  "partner", "investor", "ir", "보도자료", "사업자", "개발자", "플랫폼",
  "파트너", "엔터프라이즈", "투자자",
];

const NEWS_SUMMARY_SIGNALS = [
  "announced", "announcement", "launched", "launch", "introduced", "expansion",
  "quarter", "earnings", "growth", "발표", "공개", "출시", "도입", "확대",
  "개편", "협약", "실적", "분기", "성장",
];

const ABSTRACT_POLICY_SIGNALS = [
  "policy", "regulation", "guideline", "terms", "pricing", "fee", "settlement",
  "rules", "정책", "규정", "제도", "법", "가이드라인", "약관", "요금제",
  "수수료", "정산",
];

export class CurrentTopicInventoryError extends Error {
  constructor(message, code = "current_topic_inventory_error", details = null) {
    super(message);
    this.name = "CurrentTopicInventoryError";
    this.code = code;
    this.details = details;
  }
}

function text(value, maximum = 280) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function textList(value, maximumItems, maximumLength) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map((item) => text(item, maximumLength)).filter(Boolean))]
    .slice(0, maximumItems);
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isFresh(topic, at) {
  const expiresAt = validDate(topic?.expiresAt);
  return Boolean(expiresAt && expiresAt.getTime() > at.getTime());
}

function countSignals(value, signals, { points, maximum }) {
  const normalized = String(value || "").normalize("NFKC").toLowerCase();
  const matches = signals.filter((signal) => normalized.includes(signal)).length;
  return Math.min(matches * points, maximum);
}

function topicSearchText(topic) {
  return [
    topic?.subject,
    topic?.personaRelevance,
    ...(Array.isArray(topic?.allowedAngles) ? topic.allowedAngles : []),
    ...(Array.isArray(topic?.verifiedFacts) ? topic.verifiedFacts : []),
  ].join(" ");
}

function freshnessScore(topic, at) {
  const capturedAt = validDate(topic?.capturedAt);
  if (!capturedAt) return 0;

  const ageHours = Math.max(
    0,
    (at.getTime() - capturedAt.getTime()) / (60 * 60 * 1000)
  );

  if (ageHours <= 6) return 12;
  if (ageHours <= 18) return 9;
  if (ageHours <= 36) return 6;
  return 3;
}

export function scoreCurrentTopicThreadsWorthiness(topic, { at = new Date() } = {}) {
  const now = validDate(at);
  const normalized = normalizeCurrentTopic(topic, topic);
  if (!now || !normalized || !isFresh(normalized, now)) return null;

  const sourceText = topicSearchText(normalized);
  const relatability = Math.min(
    (CATEGORY_RELATABILITY[normalized.category] || 0) +
      countSignals(sourceText, DAILY_LIFE_SIGNALS, { points: 3, maximum: 15 }),
    30
  );
  const conversationPotential = countSignals(sourceText, CONVERSATION_SIGNALS, {
    points: 3,
    maximum: 20,
  });
  const personaFit = Math.min(
    (normalized.category === "work_productivity" ? 10 : 6) +
      countSignals(normalized.personaRelevance, DAILY_LIFE_SIGNALS, {
        points: 2,
        maximum: 12,
      }),
    20
  );
  const timeliness = freshnessScore(normalized, now);
  const practicalHookPotential = countSignals(sourceText, PRACTICAL_HOOK_SIGNALS, {
    points: 3,
    maximum: 18,
  });
  const pressReleasePenalty = countSignals(sourceText, PRESS_RELEASE_SIGNALS, {
    points: 7,
    maximum: 28,
  });
  const newsSummaryRisk = countSignals(sourceText, NEWS_SUMMARY_SIGNALS, {
    points: 3,
    maximum: 12,
  });
  const abstractPolicyPenalty = countSignals(sourceText, ABSTRACT_POLICY_SIGNALS, {
    points: 7,
    maximum: 28,
  });
  const score =
    relatability +
    conversationPotential +
    personaFit +
    timeliness +
    practicalHookPotential -
    pressReleasePenalty -
    newsSummaryRisk -
    abstractPolicyPenalty;

  return {
    score,
    scoreBreakdown: {
      relatability,
      conversationPotential,
      personaFit,
      timeliness,
      practicalHookPotential,
      pressReleasePenalty,
      newsSummaryRisk,
      abstractPolicyPenalty,
    },
  };
}

function topicId(category, subject) {
  const value = `${category}:${subject}`.toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `current_topic:${(hash >>> 0).toString(36)}`;
}

function normalizeSourceReferences(value) {
  const sources = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];

  for (const source of sources) {
    const url = text(source?.url, 500);
    const title = text(source?.title, 180);
    try {
      const parsed = new URL(url);
      if (!/^https?:$/u.test(parsed.protocol) || seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      result.push({ url: parsed.href, title: title || null });
    } catch {
      continue;
    }
    if (result.length >= MAX_SOURCES) break;
  }

  return result;
}

export function normalizeCurrentTopic(value, { capturedAt, expiresAt } = {}) {
  const category = text(value?.category, 60);
  const subject = text(value?.subject, 180);
  const verifiedFacts = textList(value?.verifiedFacts, MAX_FACTS, 280);
  const personaRelevance = text(value?.personaRelevance, 320);
  const allowedAngles = textList(value?.allowedAngles, MAX_ANGLES, 220);

  if (
    !ALLOWED_CATEGORIES.has(category) ||
    !subject ||
    !verifiedFacts.length ||
    !personaRelevance ||
    !allowedAngles.length
  ) {
    return null;
  }

  const normalizedCapturedAt = validDate(capturedAt)?.toISOString();
  const normalizedExpiresAt = validDate(expiresAt)?.toISOString();
  if (!normalizedCapturedAt || !normalizedExpiresAt) return null;

  return {
    id: topicId(category, subject),
    capturedAt: normalizedCapturedAt,
    expiresAt: normalizedExpiresAt,
    category,
    subject,
    verifiedFacts,
    personaRelevance,
    allowedAngles,
    forbiddenClaims: textList(
      [...BASE_FORBIDDEN_CLAIMS, ...(Array.isArray(value?.forbiddenClaims) ? value.forbiddenClaims : [])],
      MAX_CLAIMS,
      260
    ),
    sourceReferences: normalizeSourceReferences(value?.sourceReferences),
  };
}

function normalizeInventory(value) {
  const topics = Array.isArray(value?.topics) ? value.topics : [];
  const normalized = topics
    .map((topic) => normalizeCurrentTopic(topic, topic))
    .filter(Boolean)
    .slice(0, MAX_TOPICS);

  return {
    version: INVENTORY_VERSION,
    capturedAt: validDate(value?.capturedAt)?.toISOString() || null,
    expiresAt: validDate(value?.expiresAt)?.toISOString() || null,
    topics: normalized,
  };
}

function discoverySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      topics: {
        type: "array",
        maxItems: MAX_TOPICS,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string" },
            subject: { type: "string" },
            verifiedFacts: { type: "array", items: { type: "string" } },
            personaRelevance: { type: "string" },
            allowedAngles: { type: "array", items: { type: "string" } },
            forbiddenClaims: { type: "array", items: { type: "string" } },
            sourceReferences: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  url: { type: "string" },
                  title: { type: "string" },
                },
                required: ["url", "title"],
              },
            },
          },
          required: [
            "category",
            "subject",
            "verifiedFacts",
            "personaRelevance",
            "allowedAngles",
            "forbiddenClaims",
            "sourceReferences",
          ],
        },
      },
    },
    required: ["topics"],
  };
}

export async function discoverCurrentTopics(env, { at = new Date(), requestJson = requestOpenAiJson } = {}) {
  const now = validDate(at);
  if (!now) {
    throw new CurrentTopicInventoryError("Topic discovery time is invalid", "current_topic_time_invalid");
  }

  const result = await requestJson(env, {
    instructions: [
      "Discover current, lightweight Korean-relevant topics for a Threads persona: a practical office worker in their late 30s interested in daily life, digital services, devices, and small consumer choices.",
      "This is topic inventory research, not a Threads post. Use web search for current information.",
      "Only return categories ai_digital, apps_services, devices, work_productivity, consumer_lifestyle, seasonal_life, or light_culture.",
      "Exclude politics, elections, crime, disasters, wars, divisive controversy, medical or legal advice, financial recommendations, and serious social conflict.",
      "Return only facts supported by the web sources. Keep verifiedFacts to one to three concise factual statements.",
      "Separate facts from persona relevance and allowedAngles. Do not invent personal use, experience, numbers, dates, launch details, or certainty beyond the sources.",
      "Provide only source URLs and titles used for factual traceability; do not quote article bodies.",
    ].join(" "),
    input: `Find up to ${MAX_TOPICS} current topic candidates as of ${now.toISOString()}.`,
    name: "current_topic_inventory",
    schema: discoverySchema(),
    tools: [{ type: "web_search" }],
  });

  return (Array.isArray(result?.topics) ? result.topics : [])
    .map((topic) => normalizeCurrentTopic(topic, {
      capturedAt: now,
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_HOURS * 60 * 60 * 1000),
    }))
    .filter(Boolean)
    .filter((topic, index, topics) => topics.findIndex((item) => item.id === topic.id) === index)
    .slice(0, MAX_TOPICS);
}

export async function saveCurrentTopicInventory(env, topics, { at = new Date() } = {}) {
  const now = validDate(at);
  if (!now) {
    throw new CurrentTopicInventoryError("Topic inventory time is invalid", "current_topic_time_invalid");
  }

  const expiresAt = new Date(now.getTime() + DEFAULT_TTL_HOURS * 60 * 60 * 1000);
  const inventory = {
    version: INVENTORY_VERSION,
    capturedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    topics: (Array.isArray(topics) ? topics : [])
      .map((topic) => normalizeCurrentTopic(topic, { capturedAt: now, expiresAt }))
      .filter(Boolean)
      .filter((topic, index, values) => values.findIndex((item) => item.id === topic.id) === index)
      .slice(0, MAX_TOPICS),
  };

  await putJson(env, CURRENT_TOPIC_INVENTORY_KEY, inventory);
  return inventory;
}

export async function refreshCurrentTopicInventory(env, options = {}) {
  const topics = await discoverCurrentTopics(env, options);
  return await saveCurrentTopicInventory(env, topics, options);
}

export async function readCurrentTopicInventory(env, { at = new Date() } = {}) {
  const now = validDate(at);
  if (!now) {
    throw new CurrentTopicInventoryError("Topic inventory time is invalid", "current_topic_time_invalid");
  }

  const inventory = normalizeInventory(await getJson(env, CURRENT_TOPIC_INVENTORY_KEY));
  const topics = inventory.topics.filter((topic) => isFresh(topic, now));

  return {
    ...inventory,
    topics,
    expiredCount: inventory.topics.length - topics.length,
  };
}

export function selectCurrentTopic(inventory, { at = new Date(), category = null, recentTopicIds = [] } = {}) {
  const now = validDate(at);
  if (!now) return null;

  const recentIds = new Set(textList(recentTopicIds, 100, 160));
  const requestedCategory = text(category, 60);
  const topics = Array.isArray(inventory?.topics) ? inventory.topics : [];

  return topics
    .filter((topic) => isFresh(topic, now))
    .filter((topic) => !requestedCategory || topic.category === requestedCategory)
    .filter((topic) => !recentIds.has(topic.id))
    .map((topic) => ({
      topic,
      worthiness: scoreCurrentTopicThreadsWorthiness(topic, { at: now }),
    }))
    .filter(({ worthiness }) => Boolean(worthiness))
    .sort((left, right) => {
      const scoreDifference = right.worthiness.score - left.worthiness.score;
      const capturedDifference = new Date(right.topic.capturedAt).getTime() - new Date(left.topic.capturedAt).getTime();
      return scoreDifference || capturedDifference || left.topic.id.localeCompare(right.topic.id);
    })
    .map(({ topic, worthiness }) => ({
      ...topic,
      score: worthiness.score,
      scoreBreakdown: worthiness.scoreBreakdown,
    }))[0] || null;
}

const HOOK_DIRECTION_RULES = [
  {
    type: "schedule_check",
    signals: ["reservation", "booking", "schedule", "deadline", "ticket", "예약", "예매", "일정", "마감", "승차권"],
    direction: "일정이나 예매 시점을 놓치지 않으려고 확인하는 상황",
  },
  {
    type: "app_step_friction",
    signals: ["app", "service", "login", "payment", "order", "앱", "서비스", "로그인", "결제", "주문", "인증"],
    direction: "필요한 일을 하려고 앱이나 여러 단계를 오가는 번거로움",
  },
  {
    type: "purchase_hesitation",
    signals: ["price", "cost", "shopping", "purchase", "consumer", "가격", "비용", "장보기", "구매", "소비", "과일"],
    direction: "가격이나 필요성을 두고 구매를 잠깐 망설이는 순간",
  },
  {
    type: "compare_choice",
    signals: ["compare", "choice", "option", "비교", "선택", "옵션", "고르"],
    direction: "여러 선택지 앞에서 무엇을 고를지 다시 살피는 순간",
  },
  {
    type: "convenience_gain",
    signals: ["automation", "integrat", "convenien", "simpl", "자동화", "통합", "간편", "편의", "줄어들"],
    direction: "반복하던 일을 조금 덜 번거롭게 만들 수 있을지 떠올리는 순간",
  },
];

const CATEGORY_HOOK_DIRECTIONS = {
  work_productivity: "반복되는 업무나 일정을 처리하며 작은 번거로움을 느끼는 순간",
  ai_digital: "필요한 일을 하려고 앱이나 기기를 다시 확인하는 순간",
  apps_services: "필요한 일을 하려고 앱이나 서비스를 여는 번거로움",
  devices: "필요한 일을 하려고 기기를 다시 확인하는 순간",
  consumer_lifestyle: "생활에 필요한 것을 고르며 잠깐 비교하게 되는 순간",
  seasonal_life: "계절에 맞는 생활 준비를 하며 필요한 것을 다시 살피는 순간",
  light_culture: "일상에서 가볍게 이야기해 볼 변화를 마주한 순간",
};

export function buildCurrentTopicHookDirection(topic) {
  const normalized = normalizeCurrentTopic(topic, topic);
  if (!normalized) return null;

  const selectedAngle = text(topic?.selectedAngle, 220) || normalized.allowedAngles[0];
  const sourceText = [
    normalized.category,
    normalized.subject,
    normalized.personaRelevance,
    selectedAngle,
    ...normalized.verifiedFacts,
    ...normalized.forbiddenClaims,
  ].join(" ").normalize("NFKC").toLowerCase();

  const matchedRule = HOOK_DIRECTION_RULES.find(
    ({ signals }) => signals.some((signal) => sourceText.includes(signal))
  );

  return matchedRule?.direction || CATEGORY_HOOK_DIRECTIONS[normalized.category] || null;
}

export function buildCurrentTopicGenerationContext(topic) {
  if (!topic || typeof topic !== "object") return null;

  const normalized = normalizeCurrentTopic(topic, topic);
  if (!normalized) return null;

  return {
    topicId: normalized.id,
    category: normalized.category,
    subject: normalized.subject,
    verifiedFacts: [...normalized.verifiedFacts],
    personaRelevance: normalized.personaRelevance,
    allowedAngles: [...normalized.allowedAngles],
    forbiddenClaims: [...normalized.forbiddenClaims],
    selectedAngle: normalized.allowedAngles[0] || null,
    hookDirection: buildCurrentTopicHookDirection(normalized),
  };
}
