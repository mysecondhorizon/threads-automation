import { PostSimilarityError } from "./post-similarity.js";

const RECENT_EXACT_LIMIT = 10;
const RECENT_PATTERN_LIMIT = 4;
const RECENT_TREND_LIMIT = 3;

export class PostFormatError extends PostSimilarityError {
  constructor(message, { code = "post_format_invalid", details = null } = {}) {
    super(message, { code, details });
    this.name = "PostFormatError";
  }
}

function text(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function isDisclosureLine(line, disclosures) {
  const normalized = String(line || "").trim();
  if (!normalized) return false;
  if (disclosures.some((disclosure) => disclosure && normalized === disclosure)) return true;
  return /^(?:이|본)\s*포스팅은.*쿠팡\s*파트너스.*(?:수수료|제공받)/u.test(normalized) ||
    /^쿠팡\s*파트너스.*(?:수수료|경제적\s*이해관계|제공받)/u.test(normalized);
}

export function stripAffiliateDisclosure(value, disclosures = []) {
  let normalized = text(value);
  const exactDisclosures = (Array.isArray(disclosures) ? disclosures : [])
    .map((item) => text(item))
    .filter(Boolean);
  for (const disclosure of exactDisclosures) {
    normalized = normalized.split(disclosure).join("");
  }
  return normalized
    .split("\n")
    .filter((line) => !isDisclosureLine(line, exactDisclosures))
    .join("\n")
    .trim();
}

function countLineSentences(line) {
  const normalized = String(line || "").trim();
  if (!normalized) return 0;
  const matches = normalized.match(/[^.!?。！？…]+(?:[.!?。！？…]+|$)/gu) || [];
  return Math.max(1, matches.filter((item) => item.trim()).length);
}

function countParagraphSentences(paragraph) {
  return Math.max(
    1,
    String(paragraph || "")
      .split("\n")
      .reduce((sum, line) => sum + countLineSentences(line), 0)
  );
}

function countBlankLines(value) {
  return String(value || "")
    .split("\n")
    .filter((line) => !line.trim())
    .length;
}

export function analyzePostFormat(value, { disclosures = [] } = {}) {
  const contentText = stripAffiliateDisclosure(value, disclosures);
  const paragraphs = contentText
    ? contentText.split(/\n\s*\n+/u).map((item) => item.trim()).filter(Boolean)
    : [];
  const sentencePattern = paragraphs.map(countParagraphSentences);
  const paragraphCount = paragraphs.length;
  const firstParagraphSingleSentence = paragraphCount > 0 && sentencePattern[0] === 1;
  const lastParagraphSingleSentence = paragraphCount > 0 && sentencePattern.at(-1) === 1;
  const totalSentenceCount = sentencePattern.reduce((sum, count) => sum + count, 0);
  const questionEnding = /[?？][\s"'”’)]*$/u.test(contentText);
  const oneXOnePattern =
    paragraphCount === 3 &&
    firstParagraphSingleSentence &&
    lastParagraphSingleSentence;
  const blankLineCount = countBlankLines(contentText);
  const signature = [
    `p${paragraphCount}`,
    `s${sentencePattern.join("-") || "0"}`,
    `bl${blankLineCount}`,
    firstParagraphSingleSentence ? "first-single" : "first-grouped",
    lastParagraphSingleSentence ? "last-single" : "last-grouped",
    `q${questionEnding ? 1 : 0}`,
  ].join(":");

  return {
    signature,
    paragraphCount,
    sentenceCounts: sentencePattern,
    sentencePattern,
    blankLineCount,
    firstParagraphSingleSentence,
    lastParagraphSingleSentence,
    questionEnding,
    totalSentenceCount,
    oneXOnePattern,
    contentText,
  };
}

export function parsePostFormatSignature(value) {
  const match = String(value || "").trim().match(
    /^p(\d+):s([\d-]+):bl(\d+):(first-single|first-grouped):(last-single|last-grouped):q([01])$/u
  );
  if (!match) return null;
  const sentencePattern = match[2].split("-").map(Number);
  return {
    signature: match[0],
    paragraphCount: Number(match[1]),
    sentenceCounts: sentencePattern,
    sentencePattern,
    blankLineCount: Number(match[3]),
    firstParagraphSingleSentence: match[4] === "first-single",
    lastParagraphSingleSentence: match[5] === "last-single",
    questionEnding: match[6] === "1",
    totalSentenceCount: sentencePattern.reduce((sum, count) => sum + count, 0),
    oneXOnePattern:
      Number(match[1]) === 3 &&
      match[4] === "first-single" &&
      match[5] === "last-single",
  };
}

const FORMAT_POOL = [
  {
    id: "compact_single",
    name: "한 문단 압축형",
    patterns: [{ paragraphCount: 1, sentenceRanges: [[3, 5]] }],
    prompt: "한 문단에 3~5문장을 담고 별도 결론 문단을 만들지 않는다.",
  },
  {
    id: "balanced_two",
    name: "균형 2문단형",
    patterns: [{ paragraphCount: 2, sentenceRanges: [[2, 2], [2, 3]] }],
    prompt: "2문단으로 쓰고 문장 패턴은 2 / 2~3으로 맞춘다. 첫 문장과 마지막 문장을 별도 문단으로 떼지 않는다.",
  },
  {
    id: "front_loaded_two",
    name: "앞쪽 확장 2문단형",
    patterns: [{ paragraphCount: 2, sentenceRanges: [[3, 3], [1, 2]] }],
    prompt: "2문단으로 쓰고 문장 패턴은 3 / 1~2로 맞춘다. 도입 한 줄을 독립시키지 않는다.",
  },
  {
    id: "woven_three",
    name: "교차 3문단형",
    patterns: [{ paragraphCount: 3, sentenceRanges: [[2, 2], [1, 1], [2, 2]] }],
    prompt: "3문단, 2 / 1 / 2문장으로 쓰고 처음과 끝에 단독 한 줄을 두지 않는다.",
  },
  {
    id: "rising_three",
    name: "후반 확장 3문단형",
    patterns: [{ paragraphCount: 3, sentenceRanges: [[1, 1], [1, 1], [2, 3]] }],
    prompt: "3문단, 1 / 1 / 2~3문장으로 쓰되 마지막을 한 줄 교훈이나 요약으로 분리하지 않는다.",
  },
  {
    id: "irregular_short_lines",
    name: "불규칙 짧은 호흡형",
    patterns: [
      { paragraphCount: 2, sentenceRanges: [[2, 3], [2, 3]] },
      { paragraphCount: 3, sentenceRanges: [[2, 2], [1, 2], [1, 2]] },
      { paragraphCount: 4, sentenceRanges: [[1, 2], [1, 1], [1, 1], [1, 2]] },
    ],
    prompt: "전체 4~6개의 짧은 문장을 2~4문단에 불규칙하게 배치한다. 모든 문장마다 빈 줄을 넣지는 않는다.",
  },
  {
    id: "scene_without_summary",
    name: "장면 직진형",
    patterns: [{ paragraphCount: 2, sentenceRanges: [[2, 3], [2, 3]] }],
    prompt: "2문단의 구체적인 경험 장면에서 바로 시작해 2~3 / 2~3문장으로 쓰고 별도 요약이나 교훈 없이 장면에서 끝낸다.",
  },
  {
    id: "short_monologue",
    name: "짧은 독백형",
    patterns: [
      { paragraphCount: 1, sentenceRanges: [[2, 4]] },
      { paragraphCount: 2, sentenceRanges: [[1, 2], [1, 2]] },
    ],
    prompt: "2~4문장의 짧은 독백이나 관찰로 쓰고 한 문단 또는 2문단만 사용한다.",
  },
];

export function getPostFormatPool() {
  return FORMAT_POOL.map((format) => ({
    ...format,
    patterns: format.patterns.map((pattern) => ({
      ...pattern,
      sentenceRanges: pattern.sentenceRanges.map((range) => [...range]),
    })),
  }));
}

function normalizeRecentFormats(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => {
      if (typeof value === "string") return parsePostFormatSignature(value);
      if (value?.signature && Array.isArray(value?.sentencePattern)) return value;
      return null;
    })
    .filter(Boolean);
}

function rangeDistance(value, [minimum, maximum]) {
  if (value < minimum) return minimum - value;
  if (value > maximum) return value - maximum;
  return 0;
}

function patternDistance(format, pattern) {
  let distance = Math.abs(format.paragraphCount - pattern.paragraphCount) * 4;
  const maximumLength = Math.max(format.sentencePattern.length, pattern.sentenceRanges.length);
  for (let index = 0; index < maximumLength; index += 1) {
    const count = format.sentencePattern[index];
    const range = pattern.sentenceRanges[index];
    distance += count === undefined || !range ? 3 : rangeDistance(count, range);
  }
  return distance;
}

function targetDistance(format, target) {
  return Math.min(...target.patterns.map((pattern) => patternDistance(format, pattern)));
}

function targetCanUseSingle(target, position) {
  return target.patterns.some((pattern) => {
    if (pattern.paragraphCount <= 1) return false;
    const range = position === "first"
      ? pattern.sentenceRanges[0]
      : pattern.sentenceRanges.at(-1);
    return range[0] <= 1 && range[1] >= 1;
  });
}

function targetCanUseOneXOne(target) {
  return target.patterns.some((pattern) =>
    pattern.paragraphCount === 3 &&
    pattern.sentenceRanges[0][0] === 1 &&
    pattern.sentenceRanges.at(-1)[0] === 1
  );
}

function patternCanAvoidRecentSimilarity(
  pattern,
  recentFormats
) {
  const recent =
    recentFormats.slice(
      0,
      RECENT_PATTERN_LIMIT
    );

  const evaluateSentencePattern = (
    index,
    sentencePattern
  ) => {
    if (
      index >=
      pattern.sentenceRanges.length
    ) {
      return !recent.some(
        (recentFormat) =>
          arePostFormatsSimilar(
            recentFormat,
            {
              signature: "candidate",
              paragraphCount:
                pattern.paragraphCount,
              sentencePattern,
            }
          )
      );
    }

    const [minimum, maximum] =
      pattern.sentenceRanges[index];

    for (
      let count = minimum;
      count <= maximum;
      count += 1
    ) {
      if (
        evaluateSentencePattern(
          index + 1,
          [...sentencePattern, count]
        )
      ) {
        return true;
      }
    }

    return false;
  };

  return evaluateSentencePattern(
    0,
    []
  );
}

function targetHasFeasiblePattern(
  target,
  recentFormats
) {
  return target.patterns.some(
    (pattern) =>
      patternCanAvoidRecentSimilarity(
        pattern,
        recentFormats
      )
  );
}

export function selectTargetPostFormat(
  recentValues,
  {
    sequence = 1,
    excludedFormatIds = [],
    excludeInfeasibleTargets = false,
  } = {}
) {
  const recent = normalizeRecentFormats(recentValues);
  const excludedIds = new Set(
    (Array.isArray(excludedFormatIds) ? excludedFormatIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  const trend = recent.slice(0, RECENT_TREND_LIMIT);
  const repeatedFirstSingle = trend.filter((item) => item.firstParagraphSingleSentence).length >= 2;
  const repeatedLastSingle = trend.filter((item) => item.lastParagraphSingleSentence).length >= 2;
  const repeatedOneXOne = trend.some((item) => item.oneXOnePattern);
  const rotation = Math.max(0, Number(sequence || 1) - 1) % FORMAT_POOL.length;

  const ranked = FORMAT_POOL.map(
    (target, index) => ({ target, index })
  )
    .filter(({ target }) =>
      !excludedIds.has(target.id) &&
      (
        !excludeInfeasibleTargets ||
        targetHasFeasiblePattern(target, recent)
      )
    )
    .map(({ target, index }) => {
    let score = recent.slice(0, 6).reduce((sum, format, recentIndex) => {
      const distance = targetDistance(format, target);
      if (distance === 0) return sum + 18 / (recentIndex + 1);
      if (distance <= 2) return sum + 7 / (recentIndex + 1);
      if (format.paragraphCount === target.patterns[0].paragraphCount) {
        return sum + 2 / (recentIndex + 1);
      }
      return sum;
    }, 0);
    if (repeatedFirstSingle && targetCanUseSingle(target, "first")) score += 100;
    if (repeatedLastSingle && targetCanUseSingle(target, "last")) score += 100;
    if (repeatedOneXOne && targetCanUseOneXOne(target)) score += 120;
    const rotationDistance = (index - rotation + FORMAT_POOL.length) % FORMAT_POOL.length;
      return { target, score, rotationDistance };
    });

  ranked.sort((left, right) =>
    left.score - right.score || left.rotationDistance - right.rotationDistance
  );
  const selected = ranked[0]?.target;
  if (!selected) return null;
  return {
    ...getPostFormatPool().find((item) => item.id === selected.id),
    recentAvoidance: {
      repeatedFirstSingle,
      repeatedLastSingle,
      repeatedOneXOne,
    },
  };
}

export function arePostFormatsSimilar(firstValue, secondValue) {
  const [first, second] = normalizeRecentFormats([firstValue, secondValue]);
  if (!first || !second || first.paragraphCount !== second.paragraphCount) return false;
  if (first.sentencePattern.length !== second.sentencePattern.length) return false;
  const difference = first.sentencePattern.reduce(
    (sum, count, index) => sum + Math.abs(count - second.sentencePattern[index]),
    0
  );
  return difference <= 2;
}

export function getContextFormatDisclosures(context) {
  return (Array.isArray(context?.products?.productDetails) ? context.products.productDetails : [])
    .map((product) => text(product?.affiliateDisclosure))
    .filter(Boolean);
}

export function validatePostFormat(
  value,
  { targetFormat, recentFormats = [], disclosures = [] } = {}
) {
  const format = analyzePostFormat(value, { disclosures });
  const recent = normalizeRecentFormats(recentFormats);
  const reasons = [];
  const exactMatch = recent.slice(0, RECENT_EXACT_LIMIT)
    .find((item) => item.signature === format.signature);
  const similarMatch = recent.slice(0, RECENT_PATTERN_LIMIT)
    .find((item) => arePostFormatsSimilar(item, format));
  const trend = recent.slice(0, RECENT_TREND_LIMIT);

  if (exactMatch) reasons.push("recent_signature_repeated");
  else if (similarMatch) reasons.push("recent_pattern_too_similar");
  if (format.firstParagraphSingleSentence && trend.filter((item) => item.firstParagraphSingleSentence).length >= 2) {
    reasons.push("standalone_opening_repeated");
  }
  if (format.lastParagraphSingleSentence && trend.filter((item) => item.lastParagraphSingleSentence).length >= 2) {
    reasons.push("standalone_ending_repeated");
  }
  if (format.oneXOnePattern && trend.some((item) => item.oneXOnePattern)) {
    reasons.push("one_x_one_pattern_repeated");
  }
  if (targetFormat && targetDistance(format, targetFormat) > 0) {
    reasons.push("target_format_mismatch");
  }

  if (reasons.length) {
    throw new PostFormatError(
      "최근 글과 다른 문장·문단 구조를 만들지 못했습니다.",
      {
        code: "post_format_validation_failed",
        details: {
          reasons,
          signature: format.signature,
          targetFormatId: targetFormat?.id || null,
          targetPrompt: targetFormat?.prompt || null,
          matchedSignature: (exactMatch || similarMatch)?.signature || null,
        },
      }
    );
  }

  return format;
}
