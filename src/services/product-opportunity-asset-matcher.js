import { listMedia } from "./media.js";

const LIMIT = 5;
const THRESHOLD = 30;

function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/gu, " ").trim();
}
function tokens(value) {
  const normalized = normalize(value);
  const words = normalized.match(/[a-z0-9]+|[가-힣]{2,}/gu) || [];
  const koreanBigrams = words.filter((word) => /^[가-힣]+$/u.test(word)).flatMap((word) => Array.from({ length: Math.max(0, word.length - 1) }, (_, index) => word.slice(index, index + 2)));
  return new Set([...words, ...koreanBigrams].filter((word) => word.length >= 2));
}
function join(...values) { return values.flat().filter(Boolean).join(" "); }
function overlap(left, right, maximum) {
  const leftTokens = tokens(left); const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return { score: 0, count: 0 };
  const count = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return { score: count ? Math.min(maximum, Math.round((count / Math.min(leftTokens.size, 4)) * maximum)) : 0, count };
}
function candidate(opportunity, media) {
  const description = media.description || "";
  const tags = Array.isArray(media.tags) ? media.tags : [];
  const experienceTags = Array.isArray(media.experienceTags) ? media.experienceTags : [];
  const note = media.experienceNote || "";
  const angles = Array.isArray(media.usableAngles) ? media.usableAngles : [];
  const identity = overlap(join(opportunity.productName, opportunity.brand), join(description, tags), 15);
  const category = overlap(opportunity.category, join(description, tags), 10);
  const problem = overlap(opportunity.problem, join(note, experienceTags, description), 15);
  const situation = overlap(opportunity.situation, join(note, experienceTags, tags), 10);
  const angle = overlap(opportunity.angle, join(angles, description, note), 10);
  const noteRelevant = Boolean(note) && [opportunity.problem, opportunity.situation, opportunity.angle]
    .some((value) => overlap(value, note, 1).count > 0);
  const experienceTagsRelevant = overlap(join(opportunity.problem, opportunity.situation), experienceTags, 10);
  const usability = (description ? 4 : 0) + (tags.length ? 4 : 0) + (media.sceneType ? 3 : 0) + (angles.length ? 4 : 0);
  const score = Math.min(100, identity.score + category.score + problem.score + situation.score + angle.score + (noteRelevant ? 15 : 0) + experienceTagsRelevant.score + usability);
  const reasons = [];
  if (identity.score || category.score) reasons.push("제품/카테고리와 미디어 태그 일치");
  if (problem.score) reasons.push("문제 관련 미디어 정보 일치");
  if (situation.score) reasons.push("상황 관련 미디어 정보 일치");
  if (angle.score) reasons.push("표현 각도 관련 정보 일치");
  if (noteRelevant) reasons.push("관련 USER_EXPERIENCE 존재");
  if (experienceTagsRelevant.score) reasons.push("관련 경험 태그 일치");
  return { mediaId: media.id, matchScore: score, reasons, hasUserExperience: Boolean(note), experienceNote: note || null, kind: media.mediaKind, description, tags: [...tags], experienceTags: [...experienceTags], active: media.active === true, sceneType: media.sceneType || null, usableAngles: [...angles], previewUrl: `/media/${encodeURIComponent(media.id)}` };
}

export function matchProductOpportunityAssets(opportunity, media) {
  return (Array.isArray(media) ? media : [])
    .filter((item) => item?.sourceType === "product" && item.active === true && ["image", "video"].includes(item.mediaKind))
    .map((item) => candidate(opportunity || {}, item))
    .filter((item) => item.matchScore >= THRESHOLD)
    .sort((left, right) => right.matchScore - left.matchScore || Number(right.hasUserExperience) - Number(left.hasUserExperience) || left.mediaId.localeCompare(right.mediaId))
    .slice(0, LIMIT);
}

export async function getProductOpportunityAssetCandidates(env, opportunity, workspaceId, { list = listMedia } = {}) {
  return matchProductOpportunityAssets(opportunity, await list(env, { sourceType: "product", active: true }, workspaceId));
}

export const PRODUCT_OPPORTUNITY_ASSET_MATCH_THRESHOLD = THRESHOLD;
export const PRODUCT_OPPORTUNITY_ASSET_MATCH_LIMIT = LIMIT;
