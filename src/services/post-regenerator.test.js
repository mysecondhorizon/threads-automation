import assert from "node:assert/strict";

import {
  analyzePostFormat,
  getPostFormatPool,
} from "./post-format.js";

import {
  THREADS_OUTPUT_PROMPT,
  THREADS_VALIDATION_PROMPT,
} from "../prompts/threads/index.js";

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
const targetFormatGuidance = [];
const systemPrompts = [];
let generationCalls = 0;

const env = {
  THREADS_KV: {
    async get(key, type) {
      assert.equal(key, "operator_prompt_profile:v1");
      assert.equal(type, "json");
      return {
        version: 1,
        updatedAt: "2026-08-29T00:00:00.000Z",
        profile: {
          generalWritingPolicy: "CUSTOM_OPERATOR_WRITING_GUIDANCE",
        },
      };
    },
  },
};

const result =
  await generateDistinctThreadPost(
    env,
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
      enforceFormatValidation: false,
      generatePost: async (_env, context, options) => {
        generationCalls += 1;
        targetIds.push(
          context.publishing.targetFormat.id
        );
        targetFormatGuidance.push(
          context.publishing.targetFormatGuidance
        );
        systemPrompts.push(options.systemPrompt);

        return { body: bodyForPattern([5]) };
      },
    }
  );

assert.equal(result.attempts, 1);
assert.equal(result.regenerated, false);
assert.equal(targetIds[0], "compact_single");
assert.deepEqual(targetFormatGuidance, ["advisory"]);
assert.equal(
  result.format.signature,
  "p1:s5:bl0:first-grouped:last-grouped:q0"
);
assert.equal(systemPrompts.length, 1);
assert.ok(systemPrompts[0].includes("CUSTOM_OPERATOR_WRITING_GUIDANCE"));
assert.ok(systemPrompts[0].includes(THREADS_VALIDATION_PROMPT));
assert.ok(systemPrompts[0].includes(THREADS_OUTPUT_PROMPT));

let similarityGenerationCalls = 0;
const similarityTargetIds = [];
const duplicateBody = bodyForPattern([2]);
const similarityResult = await generateDistinctThreadPost(
  env,
  {
    products: { productDetails: [] },
    publishing: {
      goal: "Semantic duplicate retry test",
      publishSequence: 1,
      targetFormat: repeatedTarget,
    },
    history: {
      recentFormats: [analyzePostFormat(duplicateBody)],
      recentSevenDayPosts: [{ postId: "recent-1", text: duplicateBody }],
    },
  },
  {
    maxAttempts: 2,
    enforceFormatValidation: false,
    generatePost: async (_env, context) => {
      similarityGenerationCalls += 1;
      similarityTargetIds.push(context.publishing.targetFormat.id);
      return {
        body: similarityGenerationCalls === 1
          ? duplicateBody
          : "A completely unrelated afternoon observation. It has different vocabulary.",
      };
    },
  }
);

assert.equal(similarityGenerationCalls, 2);
assert.equal(similarityResult.attempts, 2);
assert.equal(similarityResult.regenerated, true);
assert.deepEqual(similarityTargetIds, ["compact_single", "compact_single"]);
assert.equal(similarityResult.similarity.duplicated, false);

let validationGenerationCalls = 0;
await assert.rejects(
  generateDistinctThreadPost(
    env,
    {
      products: { productDetails: [] },
      publishing: {
        goal: "Validation remains blocking",
        publishSequence: 1,
        targetFormat: repeatedTarget,
      },
      history: { recentFormats: [], recentSevenDayPosts: [] },
    },
    {
      maxAttempts: 2,
      enforceFormatValidation: false,
      generatePost: async () => {
        validationGenerationCalls += 1;
        return { body: "" };
      },
    }
  ),
  (error) => error?.code === "empty_post_text"
);
assert.equal(validationGenerationCalls, 1);

const workspacePromptKeys = [];
const workspaceResult = await generateDistinctThreadPost(
  {
    THREADS_KV: {
      async get(key, type) {
        workspacePromptKeys.push({ key, type });
        return {
          version: 1,
          updatedAt: "2026-08-30T00:00:00.000Z",
          profile: {
            generalWritingPolicy: "WORKSPACE_A_OPERATOR_GUIDANCE",
          },
        };
      },
    },
  },
  {
    products: { productDetails: [] },
    publishing: {
      goal: "Workspace prompt scope test",
      publishSequence: 1,
      targetFormat: repeatedTarget,
    },
    history: { recentFormats: [], recentSevenDayPosts: [] },
  },
  {
    workspaceId: "workspace-a",
    maxAttempts: 1,
    generatePost: async (_env, _context, options) => {
      assert.ok(options.systemPrompt.includes("WORKSPACE_A_OPERATOR_GUIDANCE"));
      return { body: bodyForPattern([5]) };
    },
  }
);
assert.equal(workspaceResult.attempts, 1);
assert.deepEqual(workspacePromptKeys, [
  { key: "operator_prompt_profile:v1:workspace-a", type: "json" },
]);

let exhaustedGenerationCalls = 0;

await assert.rejects(
  generateDistinctThreadPost(
    env,
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

let advisoryExhaustionGenerationCalls = 0;
const advisoryExhaustionResult = await generateDistinctThreadPost(
  env,
  {
    products: { productDetails: [] },
    publishing: {
      goal: "Advisory format selection test",
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
    enforceFormatValidation: false,
    generatePost: async () => {
      advisoryExhaustionGenerationCalls += 1;
      return { body: bodyForPattern([4]) };
    },
  }
);

assert.equal(advisoryExhaustionGenerationCalls, 1);
assert.equal(advisoryExhaustionResult.attempts, 1);
assert.equal(advisoryExhaustionResult.regenerated, false);

console.log(
  "post regenerator fixtures passed"
);
