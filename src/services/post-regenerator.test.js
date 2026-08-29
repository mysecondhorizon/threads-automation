import assert from "node:assert/strict";

import {
  analyzePostFormat,
  getPostFormatPool,
} from "./post-format.js";

import {
  generateDistinctThreadPost,
  SAFE_FORMAT_DIVERSITY_OPTIONS,
} from "./post-regenerator.js";

function bodyForPattern(sentencePattern) {
  return sentencePattern
    .map((sentenceCount, paragraphIndex) =>
      Array.from(
        { length: sentenceCount },
        (_, sentenceIndex) =>
          `새 문단${paragraphIndex + 1} 문장${sentenceIndex + 1}.`
      ).join(" ")
    )
    .join("\n\n");
}

const compact =
  getPostFormatPool().find(
    (target) =>
      target.id === "compact_single"
  );

const repeatedTarget = {
  ...compact,
  patterns: [
    {
      paragraphCount: 1,
      sentenceRanges: [[5, 5]],
    },
  ],
  selectedPattern: {
    paragraphCount: 1,
    sentencePattern: [5],
  },
  selectedPatternSignature: "p1:s5",
  prompt:
    `${compact.prompt} 이번 글은 정확히 1문단, 문장 수 5로 작성한다.`,
};

const targetIds = [];
const targetPrompts = [];
let generationCalls = 0;

const result =
  await generateDistinctThreadPost(
    {},
    {
      products: {
        productDetails: [],
      },
      publishing: {
        goal: "테스트 글 작성",
        publishSequence: 1,
        targetFormat: repeatedTarget,
      },
      history: {
        recentFormats: [
          analyzePostFormat(
            bodyForPattern([5])
          ),
        ],
        recentSevenDayPosts: [],
      },
    },
    {
      maxAttempts: 2,
      ...SAFE_FORMAT_DIVERSITY_OPTIONS,
      generatePost: async (_env, context) => {
        generationCalls += 1;
        targetIds.push(
          context.publishing.targetFormat.id
        );
        targetPrompts.push(
          context.publishing.targetFormat.prompt
        );

        const body = generationCalls === 1
          ? bodyForPattern([5])
          : bodyForPattern(
            context.publishing.targetFormat
              .selectedPattern.sentencePattern
          );

        return { body };
      },
    }
  );

assert.equal(result.attempts, 2);
assert.equal(result.regenerated, true);
assert.equal(targetIds[0], "compact_single");
assert.notEqual(
  targetIds[1],
  targetIds[0],
  "recent_signature_repeated must select a different target when one is feasible"
);
assert.notEqual(
  targetPrompts[1],
  targetPrompts[0]
);
assert.notEqual(
  result.format.signature,
  "p1:s5:bl0:first-grouped:last-grouped:q0"
);

let exhaustedGenerationCalls = 0;

await assert.rejects(
  generateDistinctThreadPost(
    {},
    {
      products: {
        productDetails: [],
      },
      publishing: {
        goal: "포맷 소진 테스트",
        publishSequence: 1,
      },
      history: {
        recentFormats: [
          analyzePostFormat(bodyForPattern([4])),
          analyzePostFormat(bodyForPattern([2, 2])),
          analyzePostFormat(bodyForPattern([2, 1, 2])),
          analyzePostFormat(bodyForPattern([1, 1, 1, 1])),
        ],
        recentSevenDayPosts: [],
      },
    },
    {
      maxAttempts: 2,
      ...SAFE_FORMAT_DIVERSITY_OPTIONS,
      generatePost: async () => {
        exhaustedGenerationCalls += 1;
        return { body: bodyForPattern([4]) };
      },
    }
  ),
  (error) =>
    error?.name === "PostFormatError" &&
    error?.code ===
      "post_format_validation_failed" &&
    error?.details?.reasons?.includes(
      "no_feasible_target_format"
    )
);

assert.equal(
  exhaustedGenerationCalls,
  0,
  "format exhaustion must fail before an unbounded generation loop"
);

console.log(
  "post regenerator fixtures passed"
);
