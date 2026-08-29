import assert from "node:assert/strict";

import {
  THREADS_OUTPUT_PROMPT,
  THREADS_VALIDATION_PROMPT,
} from "../prompts/threads/index.js";

import {
  generateProductReviewCandidate,
} from "./product-review.js";

function bodyForPattern(
  sentencePattern,
  label = "제품"
) {
  return sentencePattern
    .map((sentenceCount, paragraphIndex) =>
      Array.from(
        { length: sentenceCount },
        (_, sentenceIndex) =>
          `${label}${paragraphIndex + 1}-${sentenceIndex + 1} 기록입니다.`
      ).join(" ")
    )
    .join("\n\n");
}

class MemoryKv {
  constructor(entries = {}) {
    this.values =
      new Map(
        Object.entries(entries).map(
          ([key, value]) => [
            key,
            JSON.stringify(value),
          ]
        )
      );
  }

  async get(key, type) {
    const value =
      this.values.get(key);

    if (value === undefined) {
      return null;
    }

    return type === "json"
      ? JSON.parse(value)
      : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async list({ prefix = "" } = {}) {
    return {
      keys: [...this.values.keys()]
        .filter((key) =>
          key.startsWith(prefix)
        )
        .map((name) => ({ name })),
    };
  }
}

const affiliateLink =
  "https://example.test/product";
const disclosure =
  "이 포스팅은 제휴 활동으로 수수료를 제공받습니다.";
const recentCreatedAt =
  new Date(
    Date.now() - 60 * 60 * 1000
  ).toISOString();

const kv = new MemoryKv({
  content_products: {
    version: 1,
    products: [
      {
        id: "product-1",
        name: "테스트 제품",
        category: "생활용품",
        description: "정리할 때 사용하는 제품",
        experience: "책상 정리에 사용함",
        selectionReason: "정리 시간을 줄이기 위해 선택",
        experienceStatus: "사용함",
        affiliateLink,
        affiliateDisclosure: disclosure,
        linkEnabled: true,
        active: true,
      },
    ],
  },
  product_review_candidates: {
    version: 1,
    candidates: [],
  },
  "operator_prompt_profile:v1": {
    version: 1,
    updatedAt: "2026-08-29T00:00:00.000Z",
    profile: {
      productWritingGuidance: "CUSTOM_PRODUCT_REVIEW_GUIDANCE",
    },
  },
  "post_log:recent": {
    status: "published",
    post_id: "recent-post",
    username: "operator",
    text: bodyForPattern(
      [5],
      "과거출근관찰"
    ),
    created_at: recentCreatedAt,
    metadata: {},
  },
});

const env = {
  THREADS_KV: kv,
};

const targetIds = [];
const systemPrompts = [];
let generationCalls = 0;
const originalFetch = globalThis.fetch;

globalThis.fetch = async () => {
  throw new Error(
    "Product Review generation must not publish or call an external API in this fixture"
  );
};

let candidate;

try {
  candidate =
    await generateProductReviewCandidate(
      env,
      {
        generatePost: async (_env, context, options) => {
          generationCalls += 1;
          targetIds.push(
            context.publishing.targetFormat.id
          );
          systemPrompts.push(options.systemPrompt);

          const body = generationCalls === 1
            ? bodyForPattern(
              [5],
              "첫초안반복구조"
            )
            : bodyForPattern(
              context.publishing.targetFormat
                .selectedPattern.sentencePattern,
              "새책상정리경험"
            );

          return {
            body,
            postType: "스토리형",
            contentType: "제품 연결형",
            topic: "책상 정리",
            emotion: "개운함",
            hookStyle: "상황 시작",
            endingStyle: "경험 마무리",
            questionUsed: false,
            productId: "product-1",
            productConnected: true,
            affiliateLinkUsed: true,
            affiliateDisclosureRequired: true,
            firstComment: "",
          };
        },
      }
    );
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(generationCalls, 2);
assert.equal(systemPrompts.length, 2);
assert.equal(systemPrompts[0], systemPrompts[1]);
assert.ok(
  systemPrompts.every((prompt) =>
    prompt.includes("CUSTOM_PRODUCT_REVIEW_GUIDANCE")
  )
);
assert.ok(systemPrompts[0].includes(THREADS_VALIDATION_PROMPT));
assert.ok(systemPrompts[0].includes(THREADS_OUTPUT_PROMPT));
assert.notEqual(
  targetIds[1],
  targetIds[0],
  "Product Review must share target reselection after an exact-signature rejection"
);
assert.equal(candidate.status, "pending_review");
assert.equal(candidate.productId, "product-1");
assert.equal(candidate.firstComment, `${affiliateLink}\n\n${disclosure}`);
assert.equal(candidate.text.includes(affiliateLink), false);
assert.equal(candidate.text.includes(disclosure), false);

const storedCandidates =
  await kv.get(
    "product_review_candidates",
    "json"
  );

assert.equal(
  storedCandidates.candidates.length,
  1
);

console.log(
  "product review format fixtures passed"
);
