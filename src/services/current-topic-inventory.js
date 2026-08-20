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
    .sort((left, right) => {
      const capturedDifference = new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime();
      return capturedDifference || left.id.localeCompare(right.id);
    })[0] || null;
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
  };
}
