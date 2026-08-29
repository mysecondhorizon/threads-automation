import { listContentPool } from "./content-pool.js";
import { scoreContentPoolCandidates } from "./content-pool-scoring.js";
import { isMediaAvailable, listMedia } from "./media.js";

const GENERIC_RELEVANCE_TOKENS = new Set([
  "일상",
  "생활",
  "일반",
  "정보",
  "이야기",
  "생각",
  "콘텐츠",
  "이미지",
  "사진",
  "주제",
  "트렌드",
  "추천",
  "사용",
  "서비스",
  "변화",
  "요즘",
  "이번",
  "오늘",
  "하루",
  "시간",
  "사람",
  "경험",
  "제품",
  "기능",
  "앱",
  "디지털",
  "소비",
  "문화",
  "계절",
  "여름",
  "겨울",
  "봄",
  "가을",
]);
const MIN_MULTI_SIGNAL_MATCHES = 2;
const MIN_IMAGE_RELEVANCE_SCORE = 30;
const KOREAN_TOPIC_PARTICLE_SUFFIXES = [
  "으로",
  "에서",
  "에게",
  "한테",
  "부터",
  "까지",
  "처럼",
  "보다",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "와",
  "과",
  "도",
  "만",
  "에",
  "의",
  "로",
  "랑",
];

function text(value) {
  return String(value || "").trim();
}

function compareText(left, right) {
  const a = text(left);
  const b = text(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function timestamp(value, fallback) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTerm(value) {
  for (const suffix of KOREAN_TOPIC_PARTICLE_SUFFIXES) {
    if (value.endsWith(suffix) && value.length > suffix.length + 1) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

function terms(values) {
  const normalized = values
    .flat(Infinity)
    .map((value) => text(value).normalize("NFKC").toLowerCase())
    .join(" ");

  return new Set(
    normalized
      .split(/[^\p{L}\p{N}_]+/u)
      .map(normalizeTerm)
      .filter((value) => value.length >= 2 && !GENERIC_RELEVANCE_TOKENS.has(value))
  );
}

function matchingTerms(sourceTerms, values) {
  const candidateTerms = terms(values);
  const matches = new Set();

  for (const term of sourceTerms) {
    if (candidateTerms.has(term)) matches.add(term);
  }

  return matches;
}

function normalizedPhrases(values) {
  return values
    .flat(Infinity)
    .map((value) => text(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " "))
    .filter((value) => value.length >= 6);
}

function hasExactPhraseMatch(sourceValues, candidateValues) {
  const candidatePhrases = normalizedPhrases(candidateValues);
  return normalizedPhrases(sourceValues).some((sourcePhrase) =>
    candidatePhrases.some((candidatePhrase) =>
      candidatePhrase.includes(sourcePhrase) || sourcePhrase.includes(candidatePhrase)
    )
  );
}

function relevanceAssessment(poolItem, media, context) {
  const sourceValues = [
    context.generatedPost?.topic,
    context.currentTopic?.subject,
    context.currentTopic?.selectedAngle,
  ];
  const sourceTerms = terms(sourceValues);

  if (!sourceTerms.size) return { score: 0, strongMatch: false };

  const poolTopicMatches = matchingTerms(sourceTerms, poolItem.topics);
  const mediaTagMatches = matchingTerms(sourceTerms, media.tags);
  const descriptionMatches = matchingTerms(sourceTerms, [media.altText, media.description]);
  const exactPhraseMatch = hasExactPhraseMatch(sourceValues, [
    poolItem.topics,
    media.tags,
    media.altText,
    media.description,
  ]);
  const strongMatch = poolTopicMatches.size > 0
    || mediaTagMatches.size > 0
    || descriptionMatches.size >= MIN_MULTI_SIGNAL_MATCHES
    || exactPhraseMatch;

  return {
    score: (poolTopicMatches.size * 60)
      + (mediaTagMatches.size * 45)
      + (descriptionMatches.size * 15)
      + (exactPhraseMatch ? 30 : 0),
    strongMatch,
  };
}

function allowsContentType(poolItem, contentType) {
  const allowed = Array.isArray(poolItem?.allowedContentTypes)
    ? poolItem.allowedContentTypes.map(text).filter(Boolean)
    : [];
  const requested = text(contentType);
  return !allowed.length || !requested || allowed.includes(requested);
}

function compareCandidates(left, right) {
  if (left.relevance !== right.relevance) {
    return right.relevance - left.relevance;
  }
  if (left.poolScore !== right.poolScore) {
    return right.poolScore - left.poolScore;
  }

  const leftLastUsedAt = timestamp(left.media.lastUsedAt, -Infinity);
  const rightLastUsedAt = timestamp(right.media.lastUsedAt, -Infinity);
  if (leftLastUsedAt !== rightLastUsedAt) {
    return leftLastUsedAt - rightLastUsedAt;
  }

  const leftCreatedAt = timestamp(left.media.createdAt, Infinity);
  const rightCreatedAt = timestamp(right.media.createdAt, Infinity);
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return compareText(left.media.id, right.media.id)
    || compareText(left.poolItem.id, right.poolItem.id);
}

function textSelection(reason, candidateCount, eligibleCount) {
  return {
    mode: "TEXT",
    mediaId: null,
    contentPoolId: null,
    reason,
    score: null,
    candidateCount,
    eligibleCount,
  };
}

export function selectGeneralAutoMediaFromRecords(
  {
    poolItems = [],
    mediaRecords = [],
    generatedPost = {},
    currentTopic = null,
    at = new Date(),
  } = {}
) {
  const generalMediaById = new Map(
    mediaRecords
      .filter((media) => media?.sourceType === "general" && !media?.productId)
      .map((media) => [text(media.id), media])
      .filter(([mediaId]) => Boolean(mediaId))
  );
  const scoredPoolItems = scoreContentPoolCandidates(poolItems, {
    at,
    contentType: generatedPost?.contentType,
  });
  const candidates = [];

  for (const scored of scoredPoolItems) {
    const poolItem = scored.candidate;
    if (poolItem?.type !== "general") continue;

    for (const mediaId of poolItem.mediaIds || []) {
      const media = generalMediaById.get(text(mediaId));
      if (!media) continue;

      candidates.push({
        poolItem,
        media,
        eligible: scored.eligible
          && allowsContentType(poolItem, generatedPost?.contentType)
          && isMediaAvailable(media, at),
        poolScore: Number(scored.score || 0),
      });
    }
  }

  const candidateCount = candidates.length;
  if (!candidateCount) {
    return textSelection("no_media_candidates", 0, 0);
  }

  const eligible = candidates
    .filter((candidate) => candidate.eligible)
    .map((candidate) => ({
      ...candidate,
      relevance: relevanceAssessment(candidate.poolItem, candidate.media, {
        generatedPost,
        currentTopic,
      }),
    }));
  const eligibleCount = eligible.length;

  if (!eligibleCount) {
    return textSelection("no_eligible_media", candidateCount, 0);
  }

  const relevant = eligible
    .filter((candidate) => candidate.relevance.strongMatch
      && candidate.relevance.score >= MIN_IMAGE_RELEVANCE_SCORE)
    .map((candidate) => ({ ...candidate, relevance: candidate.relevance.score }))
    .sort(compareCandidates);

  if (!relevant.length) {
    return textSelection("relevance_too_low", candidateCount, eligibleCount);
  }

  const selected = relevant[0];
  return {
    mode: "IMAGE",
    mediaId: text(selected.media.id),
    contentPoolId: text(selected.poolItem.id),
    reason: "matched_media",
    score: selected.relevance,
    candidateCount,
    eligibleCount,
  };
}

export async function selectGeneralAutoMedia(
  env,
  options = {},
  {
    readContentPool = listContentPool,
    readMedia = listMedia,
  } = {}
) {
  if (
    options?.generatedPost?.productConnected === true
    || text(options?.generatedPost?.productId)
  ) {
    return textSelection("text_only_preferred", 0, 0);
  }

  const [poolItems, mediaRecords] = await Promise.all([
    readContentPool(env, { type: "general" }, options.workspaceId),
    readMedia(env, { sourceType: "general" }, options.workspaceId),
  ]);

  return selectGeneralAutoMediaFromRecords({
    ...options,
    poolItems,
    mediaRecords,
  });
}
