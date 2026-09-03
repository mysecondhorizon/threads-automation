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
const DEFAULT_TTL_HOURS = 14 * 24;
const MAX_TOPICS = 12;
const MAX_DISCOVERY_CANDIDATES = 24;
const MAX_FACTS = 3;
const MAX_TALKING_POINTS = 3;
const MAX_ANGLES = 4;
const MAX_CLAIMS = 5;
const MAX_SOURCES = 3;
const MAX_TOPICS_PER_NARROW_DOMAIN = 3;

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

const CATEGORY_MASS_INTEREST = {
  ai_digital: 6,
  apps_services: 8,
  devices: 7,
  work_productivity: 10,
  consumer_lifestyle: 15,
  seasonal_life: 13,
  light_culture: 10,
};

const EXCLUDED_TOPIC_SIGNALS = [
  "politics", "election", "crime", "disaster", "war", "conflict", "scandal",
  "정치", "선거", "범죄", "사건사고", "재난", "전쟁", "분쟁", "스캔들",
];

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
  return Boolean(expiresAt && expiresAt.getTime() >= at.getTime());
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

function narrowDomain(topic) {
  const source = topicSearchText(topic).toLowerCase();
  if (topic.category === "ai_digital" || topic.category === "apps_services" || topic.category === "devices") return "digital_life";
  if (/(?:food|cafe|restaurant|coffee|음식|외식|카페|커피)/u.test(source)) return "food_cafe";
  if (/(?:travel|trip|outing|hotel|여행|나들이|숙소)/u.test(source)) return "travel_outing";
  if (/(?:shopping|purchase|price|delivery|쇼핑|구매|가격|배송|소비)/u.test(source)) return "shopping_consumer";
  if (/(?:commute|car|transport|mobility|출퇴근|자동차|이동|교통)/u.test(source)) return "mobility";
  if (/(?:exercise|hobby|fitness|운동|취미)/u.test(source)) return "hobby_health";
  if (topic.category === "light_culture" || /(?:ott|movie|drama|content|콘텐츠|영화|드라마)/u.test(source)) return "light_culture";
  if (topic.category === "seasonal_life") return "seasonal_life";
  if (topic.category === "work_productivity") return "work_productivity";
  return "daily_life";
}

function isExcludedTopic(topic) {
  const source = topicSearchText(topic).toLowerCase();
  return EXCLUDED_TOPIC_SIGNALS.some((signal) => source.includes(signal));
}

function freshnessScore(topic, at) {
  const capturedAt = validDate(topic?.capturedAt);
  if (!capturedAt) return 0;

  const ageHours = Math.max(
    0,
    (at.getTime() - capturedAt.getTime()) / (60 * 60 * 1000)
  );

  if (ageHours <= 24) return 12;
  if (ageHours <= 3 * 24) return 9;
  if (ageHours <= 7 * 24) return 6;
  return 3;
}

function seoulOperationalTime(at) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    hour: Number(values.hour),
    weekend: values.weekday === "Sat" || values.weekday === "Sun",
  };
}

function operationalTimeFit(topic, at) {
  const { hour, weekend } = seoulOperationalTime(at);
  const domain = narrowDomain(topic);
  const weekendDomains = new Set([
    "food_cafe", "travel_outing", "shopping_consumer", "hobby_health", "light_culture", "seasonal_life",
  ]);
  const eveningDomains = new Set([
    "food_cafe", "travel_outing", "hobby_health", "light_culture", "seasonal_life",
  ]);
  const daytimeDomains = new Set([
    "work_productivity", "shopping_consumer", "daily_life", "food_cafe", "digital_life",
  ]);

  if (weekend) return weekendDomains.has(domain) ? 8 : 0;
  if (hour >= 18 || hour < 6) return eveningDomains.has(domain) ? 8 : 0;
  if (hour >= 9 && hour < 18) return daytimeDomains.has(domain) ? 6 : 0;
  return 0;
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
  const massInterest = Math.min(
    (CATEGORY_MASS_INTEREST[normalized.category] || 0) +
      countSignals(sourceText, DAILY_LIFE_SIGNALS, { points: 2, maximum: 10 }),
    20
  );
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
  const operationalTimeFitScore = operationalTimeFit(normalized, now);
  const score =
    massInterest +
    relatability +
    conversationPotential +
    personaFit +
    timeliness +
    operationalTimeFitScore +
    practicalHookPotential -
    pressReleasePenalty -
    newsSummaryRisk -
    abstractPolicyPenalty;

  return {
    score,
    scoreBreakdown: {
      massInterest,
      dailyRelevance: relatability,
      talkability: conversationPotential,
      relatability,
      conversationPotential,
      personaFit,
      timeliness,
      operationalTimeFit: operationalTimeFitScore,
      practicalHookPotential,
      pressReleasePenalty,
      newsSummaryRisk,
      abstractPolicyPenalty,
    },
  };
}

export function prioritizeCurrentTopics(topics, { at = new Date() } = {}) {
  const now = validDate(at);
  if (!now) return [];

  const ranked = (Array.isArray(topics) ? topics : [])
    .map((topic) => normalizeCurrentTopic(topic, topic))
    .filter(Boolean)
    .filter((topic) => isFresh(topic, now) && !isExcludedTopic(topic))
    .filter((topic, index, values) => values.findIndex((item) => item.id === topic.id) === index)
    .map((topic) => ({ topic, worthiness: scoreCurrentTopicThreadsWorthiness(topic, { at: now }) }))
    .filter(({ worthiness }) => Boolean(worthiness))
    .sort((left, right) => right.worthiness.score - left.worthiness.score || left.topic.id.localeCompare(right.topic.id));

  const domains = new Map();
  const result = [];
  for (const { topic } of ranked) {
    const domain = narrowDomain(topic);
    const count = domains.get(domain) || 0;
    if (count >= MAX_TOPICS_PER_NARROW_DOMAIN) continue;
    domains.set(domain, count + 1);
    result.push(topic);
    if (result.length >= MAX_TOPICS) break;
  }
  return result;
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
  const talkingPoints = textList(value?.talkingPoints, MAX_TALKING_POINTS, 220);
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
    talkingPoints,
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
        maxItems: MAX_DISCOVERY_CANDIDATES,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string" },
            subject: { type: "string" },
            verifiedFacts: { type: "array", items: { type: "string" } },
            talkingPoints: {
              type: "array",
              minItems: 1,
              maxItems: MAX_TALKING_POINTS,
              items: { type: "string" },
            },
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
            "talkingPoints",
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
      "Discover current Korean-relevant conversation topics for a practical office worker in their late 30s. The purpose is not recent-news collection: find subjects ordinary people can naturally connect to their own daily experience or opinion on SNS.",
      "This is topic inventory research, not a Threads post. Use web search for current information and evidence, including current events and current life signals.",
      "Only return categories ai_digital, apps_services, devices, work_productivity, consumer_lifestyle, seasonal_life, or light_culture.",
      "Balance candidates across daily life, food/cafes, travel/outings, shopping/consumer choices, smartphones/digital services, practical AI use, work/productivity, mobility, hobbies/exercise, light OTT/content/culture, and seasonal or holiday life changes. AI, digital, and devices are allowed but must not dominate the inventory.",
      "Prefer high mass interest, daily relevance to money/time/life/consumption/hobby/mobility/family, talkability for a short personal opinion, timeliness, and realistic persona fit. Do not elevate a corporate announcement, naming change, industry update, or product specification unless it has a clear everyday impact such as a price, subscription, travel, family, commute, photo, or work-use situation.",
      "A current life signal is valid when web sources establish why it is timely: seasonal routines, holiday preparation, subscription cleanup, weekend outings, eating out, shopping choices, or travel-photo organization are examples.",
      "Exclude politics, elections, crime, disasters, wars, divisive controversy, medical or legal advice, financial recommendations, and serious social conflict.",
      "Return only facts supported by the web sources. Keep verifiedFacts to one to three concise factual statements.",
      "For each topic, also return one to three talkingPoints: short everyday Korean expressions that are safe to use as the factual part of a Threads post. They must stay strictly within verifiedFacts, preserve a forecast, plan, or possibility as uncertain, and remove unnecessary press-release structure, organization names, official terms, causes, and background. Do not write a headline, news summary, or a full Threads post.",
      "Separate facts from persona relevance and allowedAngles. Do not invent personal use, experience, numbers, dates, launch details, or certainty beyond the sources.",
      "Provide only source URLs and titles used for factual traceability; do not quote article bodies.",
    ].join(" "),
    input: `Find up to ${MAX_DISCOVERY_CANDIDATES} current topic candidates as of ${now.toISOString()}.`,
    name: "current_topic_inventory",
    schema: discoverySchema(),
    tools: [{ type: "web_search" }],
  });

  return prioritizeCurrentTopics((Array.isArray(result?.topics) ? result.topics : [])
    .map((topic) => normalizeCurrentTopic(topic, {
      capturedAt: now,
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_HOURS * 60 * 60 * 1000),
    }))
    .filter((topic) => topic?.sourceReferences?.length), { at: now });
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

export function getEligibleCurrentTopics(inventory, { at = new Date(), category = null, recentTopicIds = [] } = {}) {
  const now = validDate(at);
  if (!now) return [];

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
    }));
}

export function selectCurrentTopic(inventory, options = {}) {
  return getEligibleCurrentTopics(inventory, options)[0] || null;
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
    talkingPoints: [...normalized.talkingPoints],
    personaRelevance: normalized.personaRelevance,
    allowedAngles: [...normalized.allowedAngles],
    forbiddenClaims: [...normalized.forbiddenClaims],
    selectedAngle: normalized.allowedAngles[0] || null,
    hookDirection: buildCurrentTopicHookDirection(normalized),
    expiresAt: normalized.expiresAt,
  };
}

export async function resolveCurrentTopicGeneration(
  env,
  {
    at = new Date(),
    recentTopicIds = [],
    readInventory = readCurrentTopicInventory,
    getEligibleTopics = getEligibleCurrentTopics,
    buildGenerationContext = buildCurrentTopicGenerationContext,
  } = {}
) {
  const inventory = await readInventory(env, { at });
  const eligibleTopics = getEligibleTopics(inventory, { at, recentTopicIds });
  const topic = eligibleTopics[0] || null;

  return {
    inventory,
    eligibleTopics,
    topic,
    currentTopic: buildGenerationContext(topic),
  };
}

export async function resolveCurrentTopicGenerationContext(
  env,
  {
    at = new Date(),
    recentTopicIds = [],
    readInventory = readCurrentTopicInventory,
    selectTopic = selectCurrentTopic,
    buildGenerationContext = buildCurrentTopicGenerationContext,
  } = {}
) {
  const result = await resolveCurrentTopicGeneration(env, {
    at,
    recentTopicIds,
    readInventory,
    getEligibleTopics: (inventory, options) => {
      const topic = selectTopic(inventory, options);
      return topic ? [topic] : [];
    },
    buildGenerationContext,
  });
  return result.currentTopic;
}
