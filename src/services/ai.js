import {
  THREADS_SYSTEM_PROMPT,
} from "../prompts/threads/index.js";

const OPENAI_RESPONSES_URL =
  "https://api.openai.com/v1/responses";

const GENERATED_SECTION_PATTERN =
  /^\s*\[(글 유형|본문|첫 댓글|기록 데이터)\]\s*$/gm;

const MAX_RECENT_POSTS =
  10;

export class AiServiceError extends Error {
  constructor(
    message,
    details = null
  ) {
    super(message);

    this.name =
      "AiServiceError";

    this.details =
      details;
  }
}

function extractOutputText(
  data
) {
  const texts = [];

  for (
    const item of
    data.output || []
  ) {
    if (
      item.type !== "message"
    ) {
      continue;
    }

    for (
      const content of
      item.content || []
    ) {
      if (
        content.type ===
          "output_text" &&
        typeof content.text ===
          "string"
      ) {
        texts.push(
          content.text
        );
      }
    }
  }

  return texts
    .join("\n")
    .trim();
}

function normalizeLineBreaks(
  value
) {
  return String(
    value || ""
  )
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function normalizeFirstComment(
  value
) {
  const comment =
    normalizeLineBreaks(
      value
    );

  const lowerComment =
    comment.toLowerCase();

  if (
    !comment ||
    comment === "없음" ||
    comment === "해당 없음" ||
    lowerComment === "none" ||
    lowerComment === "null"
  ) {
    return "";
  }

  return comment;
}

function hasStructuredSections(
  text
) {
  return (
    /^\s*\[(글 유형|본문|첫 댓글|기록 데이터)\]\s*$/m
  ).test(text);
}

function extractStructuredSections(
  value
) {
  const text =
    normalizeLineBreaks(
      value
    );

  const matches = [
    ...text.matchAll(
      GENERATED_SECTION_PATTERN
    ),
  ];

  if (
    matches.length === 0
  ) {
    return null;
  }

  const sections = {};

  for (
    let index = 0;
    index < matches.length;
    index += 1
  ) {
    const current =
      matches[index];

    const next =
      matches[index + 1];

    const sectionName =
      current[1];

    const contentStart =
      current.index +
      current[0].length;

    const contentEnd =
      next
        ? next.index
        : text.length;

    sections[sectionName] =
      text
        .slice(
          contentStart,
          contentEnd
        )
        .trim();
  }

  return sections;
}

function parseRecordData(
  value
) {
  const text =
    normalizeLineBreaks(
      value
    );

  if (!text) {
    return {
      raw:
        "",

      fields:
        {},
    };
  }

  const fields = {};

  for (
    const line of
    text.split("\n")
  ) {
    const separatorIndex =
      line.indexOf(":");

    if (
      separatorIndex <= 0
    ) {
      continue;
    }

    const key =
      line
        .slice(
          0,
          separatorIndex
        )
        .trim();

    const fieldValue =
      line
        .slice(
          separatorIndex + 1
        )
        .trim();

    if (key) {
      fields[key] =
        fieldValue;
    }
  }

  return {
    raw:
      text,

    fields,
  };
}

function parseGeneratedPost(
  selected
) {
  const rawText =
    normalizeLineBreaks(
      selected?.text
    );

  if (!rawText) {
    throw new AiServiceError(
      "OpenAI returned an empty selected draft"
    );
  }

  const schemaFirstComment =
    normalizeFirstComment(
      selected?.firstComment
    );

  if (
    !hasStructuredSections(
      rawText
    )
  ) {
    return {
      body:
        rawText,

      postType:
        normalizeLineBreaks(
          selected?.style
        ),

      firstComment:
        schemaFirstComment,

      recordData: {
        raw:
          "",

        fields:
          {},
      },

      sourceFormat:
        "json_schema",
    };
  }

  const sections =
    extractStructuredSections(
      rawText
    );

  const body =
    normalizeLineBreaks(
      sections?.["본문"]
    );

  if (!body) {
    throw new AiServiceError(
      "OpenAI structured output did not contain a valid body",
      {
        rawText,
        sections,
      }
    );
  }

  const sectionPostType =
    normalizeLineBreaks(
      sections?.["글 유형"]
    );

  const sectionFirstComment =
    normalizeFirstComment(
      sections?.["첫 댓글"]
    );

  return {
    body,

    postType:
      sectionPostType ||
      normalizeLineBreaks(
        selected?.style
      ),

    firstComment:
      schemaFirstComment ||
      sectionFirstComment,

    recordData:
      parseRecordData(
        sections?.["기록 데이터"]
      ),

    sourceFormat:
      "labeled_sections",
  };
}

function validateDraft(
  draft,
  index
) {
  const style =
    normalizeLineBreaks(
      draft?.style
    );

  const text =
    normalizeLineBreaks(
      draft?.text
    );

  const firstComment =
    normalizeFirstComment(
      draft?.firstComment
    );

  if (!style) {
    throw new AiServiceError(
      "OpenAI returned a draft without a style",
      {
        index,
        draft,
      }
    );
  }

  if (!text) {
    throw new AiServiceError(
      "OpenAI returned a draft without text",
      {
        index,
        draft,
      }
    );
  }

  return {
    style,
    text,
    firstComment,
  };
}

function normalizePostForContext(
  post
) {
  return {
    postId:
      String(
        post?.postId || ""
      ),

    text:
      normalizeLineBreaks(
        post?.text
      ),

    createdAt:
      post?.createdAt ||
      null,
  };
}

function normalizeProductList(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function buildAiContextData(
  context
) {
  if (!context) {
    return null;
  }

  const recentPosts =
    Array.isArray(
      context?.history
        ?.recentSevenDayPosts
    )
      ? context.history
          .recentSevenDayPosts
          .slice(
            0,
            MAX_RECENT_POSTS
          )
          .map(
            normalizePostForContext
          )
      : [];

  return {
    meta: {
      version:
        context?.meta
          ?.version ||
        null,

      generatedAt:
        context?.meta
          ?.generatedAt ||
        null,

      timeZone:
        context?.meta
          ?.timeZone ||
        null,
    },

    environment: {
      currentDate:
        context?.environment
          ?.currentDate ||
        null,

      currentTime:
        context?.environment
          ?.currentTime ||
        null,

      weekday:
        context?.environment
          ?.weekday ||
        null,

      weather:
        context?.environment
          ?.weather ||
        null,

      season:
        context?.environment
          ?.season ||
        null,
    },

    publishing: {
      publishSequence:
        context?.publishing
          ?.publishSequence ??
        null,

      todayLinkCount:
        context?.publishing
          ?.todayLinkCount ??
        0,

      linkAvailable:
        Boolean(
          context?.publishing
            ?.linkAvailable
        ),

      goal:
        context?.publishing
          ?.goal ||
        null,

      requestedTone:
        context?.publishing
          ?.requestedTone ||
        null,
    },

    history: {
      todayPostCount:
        context?.history
          ?.todayPostCount ??
        0,

      recentPostCount:
        context?.history
          ?.recentPostCount ??
        0,

      recentPosts,

      recentProducts:
        normalizeProductList(
          context?.history
            ?.recentProducts
        ),
    },

    products: {
      availableProducts:
        normalizeProductList(
          context?.products
            ?.availableProducts
        ),

      productExperience:
        normalizeProductList(
          context?.products
            ?.productExperience
        ),

      productDetails:
        normalizeProductList(
          context?.products
            ?.productDetails
        ),

      productPrices:
        normalizeProductList(
          context?.products
            ?.productPrices
        ),

      productPhotos:
        normalizeProductList(
          context?.products
            ?.productPhotos
        ),
    },

    analytics: {
      performanceLevel:
        context?.analytics
          ?.performanceLevel ||
        null,

      observations:
        normalizeProductList(
          context?.analytics
            ?.observations
        ),

      recommendations:
        context?.analytics
          ?.recommendations ||
        null,

      summary:
        context?.analytics
          ?.summary ||
        null,

      topHooks:
        normalizeProductList(
          context?.analytics
            ?.topHooks
        ),

      topTopics:
        normalizeProductList(
          context?.analytics
            ?.topTopics
        ),

      lowPerformanceTopics:
        normalizeProductList(
          context?.analytics
            ?.lowPerformanceTopics
        ),
    },
  };
}

function buildGenerationInput(
  {
    topic,
    tone,
    context,
  }
) {
  const lines = [
    `작성 목표: ${topic}`,
    `기본 톤: ${tone}`,
    "세 초안의 문장 구조와 도입부가 서로 겹치지 않게 작성하세요.",
    "각 초안의 text에는 실제 게시할 본문만 작성하세요.",
    "제품 링크나 추가 안내가 필요한 경우에만 firstComment를 작성하세요.",
    "첫 댓글이 필요하지 않으면 firstComment는 빈 문자열로 작성하세요.",
  ];

  const contextData =
    buildAiContextData(
      context
    );

  if (contextData) {
    lines.push(
      "",
      "아래는 이번 게시글 작성에 사용해야 하는 실제 컨텍스트입니다.",
      "입력되지 않은 사실은 만들지 마세요.",
      "제품 글을 작성할 때는 products의 실제 데이터만 사용하세요.",
      "제품 경험이 없거나 정보가 부족하면 일반 글을 작성하세요.",
      "affiliateLink가 비어 있거나 linkEnabled가 false라면 firstComment에 링크를 만들지 마세요.",
      "",
      "[THREAD_CONTEXT_JSON]",
      JSON.stringify(
        contextData,
        null,
        2
      ),
      "[/THREAD_CONTEXT_JSON]"
    );
  }

  return lines.join(
    "\n"
  );
}

export async function generateThreadsDrafts(
  env,
  {
    topic,
    tone =
      "친근하고 통찰력 있는",
    context = null,
  }
) {
  if (
    !env.OPENAI_API_KEY
  ) {
    throw new AiServiceError(
      "OPENAI_API_KEY is not configured"
    );
  }

  const input =
    buildGenerationInput({
      topic,
      tone,
      context,
    });

  const response =
    await fetch(
      OPENAI_RESPONSES_URL,
      {
        method:
          "POST",

        headers: {
          authorization:
            `Bearer ${env.OPENAI_API_KEY}`,

          "content-type":
            "application/json",
        },

        body:
          JSON.stringify({
            model:
              env.OPENAI_MODEL ||
              "gpt-5.6",

            store:
              false,

            reasoning: {
              effort:
                "low",
            },

            instructions:
              THREADS_SYSTEM_PROMPT,

            input,

            text: {
              format: {
                type:
                  "json_schema",

                name:
                  "threads_drafts",

                strict:
                  true,

                schema: {
                  type:
                    "object",

                  additionalProperties:
                    false,

                  properties: {
                    drafts: {
                      type:
                        "array",

                      minItems:
                        3,

                      maxItems:
                        3,

                      items: {
                        type:
                          "object",

                        additionalProperties:
                          false,

                        properties: {
                          style: {
                            type:
                              "string",

                            enum: [
                              "전문가형",
                              "스토리형",
                              "후킹형",
                            ],
                          },

                          text: {
                            type:
                              "string",
                          },

                          firstComment: {
                            type:
                              "string",
                          },
                        },

                        required: [
                          "style",
                          "text",
                          "firstComment",
                        ],
                      },
                    },
                  },

                  required: [
                    "drafts",
                  ],
                },
              },
            },
          }),
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new AiServiceError(
      "OpenAI request failed",
      data
    );
  }

  const outputText =
    extractOutputText(
      data
    );

  if (!outputText) {
    throw new AiServiceError(
      "OpenAI returned no text",
      data
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        outputText
      );
  } catch {
    throw new AiServiceError(
      "OpenAI returned invalid JSON",
      {
        outputText,
      }
    );
  }

  if (
    !Array.isArray(
      parsed.drafts
    ) ||
    parsed.drafts.length !== 3
  ) {
    throw new AiServiceError(
      "OpenAI returned an invalid draft list",
      parsed
    );
  }

  return parsed.drafts.map(
    (
      draft,
      index
    ) =>
      validateDraft(
        draft,
        index
      )
  );
}

export async function generateThreadPost(
  env,
  context
) {
  const topic =
    context?.publishing
      ?.goal ||
    "Threads 게시글 작성";

  const tone =
    context?.publishing
      ?.requestedTone ||
    "친근하고 통찰력 있는";

  const drafts =
    await generateThreadsDrafts(
      env,
      {
        topic,
        tone,
        context,
      }
    );

  const selected =
    drafts[0];

  const parsedPost =
    parseGeneratedPost(
      selected
    );

  if (
    parsedPost.body.length >
    500
  ) {
    throw new AiServiceError(
      "OpenAI generated a post body longer than 500 characters",
      {
        length:
          parsedPost.body.length,

        body:
          parsedPost.body,
      }
    );
  }

  if (
    parsedPost.firstComment
      .length > 500
  ) {
    throw new AiServiceError(
      "OpenAI generated a first comment longer than 500 characters",
      {
        length:
          parsedPost
            .firstComment
            .length,

        firstComment:
          parsedPost
            .firstComment,
      }
    );
  }

  return {
    body:
      parsedPost.body,

    postType:
      parsedPost.postType,

    firstComment:
      parsedPost.firstComment,

    metadata: {
      generatedAt:
        new Date().toISOString(),

      sourceFormat:
        parsedPost.sourceFormat,

      contextVersion:
        context?.meta
          ?.version ||
        null,

      availableProductCount:
        Array.isArray(
          context?.products
            ?.availableProducts
        )
          ? context.products
              .availableProducts
              .length
          : 0,

      productExperienceCount:
        Array.isArray(
          context?.products
            ?.productExperience
        )
          ? context.products
              .productExperience
              .length
          : 0,

      recordData:
        parsedPost.recordData,
    },
  };
}