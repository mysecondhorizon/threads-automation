import { requestOpenAiJson } from "./ai.js";
import { readCurrentTopicInventory } from "./current-topic-inventory.js";
import {
  listProductOpportunities,
  saveProductOpportunity,
} from "./product-opportunities.js";

export const PRODUCT_OPPORTUNITY_DISCOVERY_MAX_CANDIDATES = 6;

const SCORE_FIELDS = Object.freeze([
  "trendScore",
  "personaFitScore",
  "purchaseIntentScore",
  "contentPotentialScore",
  "experiencePotentialScore",
  "affiliatePotentialScore",
]);

const SCORE_WEIGHTS = Object.freeze({
  trendScore: 0.15,
  personaFitScore: 0.20,
  purchaseIntentScore: 0.20,
  contentPotentialScore: 0.15,
  experiencePotentialScore: 0.10,
  affiliatePotentialScore: 0.20,
});

const REQUIRED_TEXT_FIELDS = Object.freeze([
  "productName",
  "category",
  "problem",
  "audience",
  "situation",
  "angle",
  "discoveryReason",
]);

const TEXT_LIMITS = Object.freeze({
  productName: 140,
  brand: 120,
  category: 80,
  problem: 400,
  audience: 300,
  situation: 400,
  angle: 400,
  discoveryReason: 500,
});

const EXCLUDED_SIGNALS = [
  "politics", "election", "crime", "tragedy", "disaster", "war", "gambling",
  "alcohol", "nicotine", "tobacco", "drug", "weapon", "adult", "counterfeit",
  "medical diagnosis", "treatment", "investment", "stock", "b2b", "enterprise",
  "정치", "선거", "범죄", "재난", "전쟁", "도박", "주류", "담배", "마약",
  "무기", "성인용", "위조", "의료 진단", "치료", "투자", "주식", "기업용",
];

export class ProductOpportunityDiscoveryError extends Error {
  constructor(message, code = "product_opportunity_discovery_failed") {
    super(message);
    this.name = "ProductOpportunityDiscoveryError";
    this.code = code;
  }
}

function text(value, maximum) {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, maximum)
    : "";
}

function normalizedUrl(value) {
  const candidate = text(value, 2_000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeSourceUrls(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map(normalizedUrl).filter(Boolean))].slice(0, 4);
}

function normalizeIdentityPart(value) {
  return text(value, 500)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function opportunityIdentity(value) {
  return ["productName", "category", "problem", "situation"]
    .map((field) => normalizeIdentityPart(value?.[field]))
    .join("|");
}

function isExcluded(candidate) {
  const value = REQUIRED_TEXT_FIELDS
    .map((field) => candidate[field] || "")
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
  return EXCLUDED_SIGNALS.some((signal) => value.includes(signal));
}

function normalizeScore(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

export function calculateOpportunityScore(candidate) {
  const values = SCORE_FIELDS.map((field) => normalizeScore(candidate?.[field]));
  if (values.some((value) => value === null)) return null;
  const total = SCORE_FIELDS.reduce((sum, field) => sum + candidate[field] * SCORE_WEIGHTS[field], 0);
  return Math.round(total * 10) / 10;
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const normalized = {};
  for (const field of Object.keys(TEXT_LIMITS)) normalized[field] = text(candidate[field], TEXT_LIMITS[field]);
  if (REQUIRED_TEXT_FIELDS.some((field) => !normalized[field]) || isExcluded(normalized)) return null;
  const signalSources = normalizeSourceUrls(candidate.signalSources);
  if (!signalSources.length) return null;
  for (const field of SCORE_FIELDS) {
    normalized[field] = normalizeScore(candidate[field]);
    if (normalized[field] === null) return null;
  }
  const opportunityScore = calculateOpportunityScore(normalized);
  if (opportunityScore === null) return null;
  const sourceUrl = normalizedUrl(candidate.sourceUrl);
  return {
    ...normalized,
    signalSources,
    sourceUrl: sourceUrl && signalSources.includes(sourceUrl) ? sourceUrl : signalSources[0],
    affiliateLink: null,
    opportunityScore,
    status: opportunityScore >= 75 && signalSources.length >= 2 ? "RECOMMENDED" : "DISCOVERED",
  };
}

function compactTopic(topic) {
  return {
    category: text(topic?.category, 80),
    subject: text(topic?.subject, 180),
    personaRelevance: text(topic?.personaRelevance, 240),
    verifiedFacts: (Array.isArray(topic?.verifiedFacts) ? topic.verifiedFacts : [])
      .map((fact) => text(fact, 220)).filter(Boolean).slice(0, 3),
  };
}

function compactExistingOpportunity(opportunity) {
  return {
    productName: text(opportunity?.productName, 140),
    category: text(opportunity?.category, 80),
    problem: text(opportunity?.problem, 280),
    audience: text(opportunity?.audience, 180),
    situation: text(opportunity?.situation, 280),
    angle: text(opportunity?.angle, 280),
    status: text(opportunity?.status, 30),
  };
}

function discoverySchema() {
  const textProperty = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      candidates: {
        type: "array",
        maxItems: PRODUCT_OPPORTUNITY_DISCOVERY_MAX_CANDIDATES,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            productName: textProperty,
            brand: textProperty,
            category: textProperty,
            problem: textProperty,
            audience: textProperty,
            situation: textProperty,
            angle: textProperty,
            discoveryReason: textProperty,
            signalSources: { type: "array", maxItems: 4, items: textProperty },
            sourceUrl: { type: ["string", "null"] },
            trendScore: { type: "number" },
            personaFitScore: { type: "number" },
            purchaseIntentScore: { type: "number" },
            contentPotentialScore: { type: "number" },
            experiencePotentialScore: { type: "number" },
            affiliatePotentialScore: { type: "number" },
          },
          required: [
            "productName", "brand", "category", "problem", "audience", "situation", "angle",
            "discoveryReason", "signalSources", "sourceUrl", ...SCORE_FIELDS,
          ],
        },
      },
    },
    required: ["candidates"],
  };
}

function discoveryInstructions() {
  return [
    "Discover up to 6 current South Korean consumer product opportunities for a realistic, practical, curious office worker in their late 30s.",
    "Use web search for public signals: Google Trends or search momentum where relevant, public shopping or marketplace category interest, seasonality, practical consumer problems, purchase intent, or product-related news only when it implies a real consumer need.",
    "Current Topic context is supporting signal only. Treat web research as EXTERNAL_SIGNAL and your analysis as AI_INFERENCE, never USER_EXPERIENCE.",
    "Do not write first-person claims such as I used it, I tried it, or our home uses it. No personal experience is available.",
    "Return source URLs only for signalSources, never vague labels. Every candidate needs at least one verifiable external HTTP(S) URL; prefer two independent URLs where practical.",
    "Do not suggest politics, crime, disasters, medical treatment, investment, gambling, alcohol, nicotine, drugs, weapons, adult products, unsafe or regulated products, counterfeit goods, B2B/enterprise products, celebrity gossip, or vague viral items without a clear consumer problem and purchase intent.",
    "Do not output lifecycle status, opportunityScore, affiliateLink, IDs, workspace data, media IDs, timestamps, or user experience. Affiliate links are unavailable.",
    "Provide concise opportunity analysis, not a post, article summary, or scraped excerpts.",
  ].join(" ");
}

export async function discoverProductOpportunities(env, {
  workspaceId,
  at = new Date(),
  requestJson = requestOpenAiJson,
  readInventory = readCurrentTopicInventory,
  list = listProductOpportunities,
  save = saveProductOpportunity,
} = {}) {
  if (typeof workspaceId !== "string" || !workspaceId.trim()) {
    throw new ProductOpportunityDiscoveryError("Product Opportunity workspace is invalid", "product_opportunity_discovery_workspace_invalid");
  }
  const [existing, inventory] = await Promise.all([
    list(env, workspaceId),
    readInventory(env, { at }).catch(() => ({ topics: [] })),
  ]);
  const currentTopics = (Array.isArray(inventory?.topics) ? inventory.topics : [])
    .slice(0, 8).map(compactTopic).filter((topic) => topic.subject);
  const existingOpportunities = (Array.isArray(existing) ? existing : [])
    .slice(0, 50).map(compactExistingOpportunity).filter((opportunity) => opportunity.productName);

  const result = await requestJson(env, {
    instructions: discoveryInstructions(),
    input: JSON.stringify({
      currentTopics,
      existingOpportunities,
      requestedCount: PRODUCT_OPPORTUNITY_DISCOVERY_MAX_CANDIDATES,
    }),
    name: "product_opportunity_discovery",
    schema: discoverySchema(),
    tools: [{ type: "web_search" }],
  });

  const candidates = Array.isArray(result?.candidates) ? result.candidates.slice(0, PRODUCT_OPPORTUNITY_DISCOVERY_MAX_CANDIDATES) : [];
  const identities = new Set((Array.isArray(existing) ? existing : []).map(opportunityIdentity).filter(Boolean));
  const accepted = [];
  let skippedInvalidCount = 0;
  let skippedDuplicateCount = 0;
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    if (!normalized) {
      skippedInvalidCount += 1;
      continue;
    }
    const identity = opportunityIdentity(normalized);
    if (!identity || identities.has(identity)) {
      skippedDuplicateCount += 1;
      continue;
    }
    identities.add(identity);
    accepted.push(normalized);
  }

  const opportunities = [];
  for (const candidate of accepted) {
    try {
      opportunities.push(await save(env, candidate, workspaceId));
    } catch {
      throw new ProductOpportunityDiscoveryError("Product Opportunity save failed", "product_opportunity_discovery_save_failed");
    }
  }
  return {
    discoveredAt: new Date(at).toISOString(),
    requestedCount: PRODUCT_OPPORTUNITY_DISCOVERY_MAX_CANDIDATES,
    receivedCount: candidates.length,
    savedCount: opportunities.length,
    recommendedCount: opportunities.filter((opportunity) => opportunity.status === "RECOMMENDED").length,
    discoveredCount: opportunities.filter((opportunity) => opportunity.status === "DISCOVERED").length,
    skippedDuplicateCount,
    skippedInvalidCount,
    opportunities,
  };
}
