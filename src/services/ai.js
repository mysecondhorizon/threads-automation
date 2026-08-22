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

function parseJsonOutputText(value) {
  const text = String(value || "").trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return JSON.parse(fenced ? fenced[1].trim() : text);
}

export async function requestOpenAiJson(
  env,
  {
    instructions,
    input,
    name,
    schema,
    tools,
  }
) {
  if (!env.OPENAI_API_KEY) {
    throw new AiServiceError("OPENAI_API_KEY is not configured");
  }

  let response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5.6",
        store: false,
        reasoning: { effort: "low" },
        instructions,
        input,
        ...(Array.isArray(tools) && tools.length
          ? { tools }
          : {}),
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema,
          },
        },
      }),
    });
  } catch (error) {
    throw new AiServiceError("OpenAI request failed", {
      category: "network",
      message: error?.message || String(error),
    });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new AiServiceError("OpenAI returned invalid response JSON", {
      category: "malformed_response",
      status: response.status,
    });
  }

  if (!response.ok) {
    throw new AiServiceError("OpenAI request failed", {
      category: "http",
      status: response.status,
    });
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new AiServiceError("OpenAI returned no text", {
      category: "malformed_response",
      status: response.status,
    });
  }

  try {
    return parseJsonOutputText(outputText);
  } catch {
    throw new AiServiceError("OpenAI returned invalid JSON", {
      category: "malformed_response",
      status: response.status,
    });
  }
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

  const contentType =
  normalizeLineBreaks(
    draft?.contentType
  );

  const topic =
    normalizeLineBreaks(
      draft?.topic
    );

  const emotion =
    normalizeLineBreaks(
      draft?.emotion
    );

  const hookStyle =
    normalizeLineBreaks(
      draft?.hookStyle
    );

  const endingStyle =
    normalizeLineBreaks(
      draft?.endingStyle
    );

  const productId =
    draft?.productId === null
      ? null
      : normalizeLineBreaks(
          draft?.productId
        ) ||
        null;

  if (!contentType) {
    throw new AiServiceError(
      "OpenAI returned a draft without contentType",
      {
        index,
        draft,
      }
    );
  }

  if (!topic) {
    throw new AiServiceError(
      "OpenAI returned a draft without topic",
      {
        index,
        draft,
      }
    );
  }

  return {
    style,

    contentType,

    topic,

    emotion,

    hookStyle,

    endingStyle,

    questionUsed:
      Boolean(
        draft?.questionUsed
      ),

    productId,

    productConnected:
      Boolean(
        draft?.productConnected
      ),

    affiliateLinkUsed:
      Boolean(
        draft?.affiliateLinkUsed
      ),

    affiliateDisclosureRequired:
      Boolean(
        draft
          ?.affiliateDisclosureRequired
      ),

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

function normalizeFormatForContext(
  format
) {
  if (!format) {
    return null;
  }

  return {
    signature:
      format.signature ||
      null,

    paragraphCount:
      format.paragraphCount ??
      null,

    sentencePattern:
      Array.isArray(
        format.sentencePattern
      )
        ? format.sentencePattern
        : [],

    blankLineCount:
      format.blankLineCount ??
      null,

    firstParagraphSingleSentence:
      Boolean(
        format.firstParagraphSingleSentence
      ),

    lastParagraphSingleSentence:
      Boolean(
        format.lastParagraphSingleSentence
      ),

    questionEnding:
      Boolean(
        format.questionEnding
      ),

    totalSentenceCount:
      format.totalSentenceCount ??
      null,

    oneXOnePattern:
      Boolean(
        format.oneXOnePattern
      ),
  };
}

function normalizeCurrentTopicForContext(value) {
  const textList = (items) =>
    Array.isArray(items)
      ? items
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
      : [];

  const topicId = String(value?.topicId || "").trim();
  const category = String(value?.category || "").trim();
  const subject = String(value?.subject || "").trim();
  const personaRelevance = String(value?.personaRelevance || "").trim();
  const allowedAngles = textList(value?.allowedAngles);
  const verifiedFacts = textList(value?.verifiedFacts);
  const hookDirection = String(value?.hookDirection || "").trim();

  if (!topicId || !category || !subject || !personaRelevance || !allowedAngles.length || !verifiedFacts.length) {
    return null;
  }

  const selectedAngle = String(value?.selectedAngle || "").trim();

  return {
    topicId,
    category,
    subject,
    verifiedFacts,
    personaRelevance,
    allowedAngles,
    forbiddenClaims: textList(value?.forbiddenClaims),
    selectedAngle:
      allowedAngles.includes(selectedAngle)
        ? selectedAngle
        : allowedAngles[0],
    ...(hookDirection ? { hookDirection } : {}),
  };
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

  const currentTopic =
    normalizeCurrentTopicForContext(
      context?.currentTopic
    );

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

      questionAvailable:
        Boolean(
          context?.publishing
            ?.questionAvailable
        ),

      productConnectedAvailable:
        Boolean(
          context?.publishing
            ?.productConnectedAvailable
        ),

      affiliateLinkAvailable:
        Boolean(
          context?.publishing
            ?.affiliateLinkAvailable
        ),

      serverManagedAffiliateComment:
        Boolean(
          context?.publishing
            ?.serverManagedAffiliateComment
        ),

      firstCommentTopicTag:
        context?.publishing
          ?.firstCommentTopicTag ||
        null,

      targetFormat:
        context?.publishing
          ?.targetFormat ||
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

      todayQuestionCount:
        context?.history
          ?.todayQuestionCount ??
        0,

      todayProductConnectedCount:
        context?.history
          ?.todayProductConnectedCount ??
        0,

      todayAffiliateLinkCount:
        context?.history
          ?.todayAffiliateLinkCount ??
        0,

      recentContentTypes:
        normalizeProductList(
          context?.history
            ?.recentContentTypes
        ),

      recentTopics:
        normalizeProductList(
          context?.history
            ?.recentTopics
        ),

      recentEmotions:
        normalizeProductList(
          context?.history
            ?.recentEmotions
        ),

      recentHookStyles:
        normalizeProductList(
          context?.history
            ?.recentHookStyles
        ),

      recentEndingStyles:
        normalizeProductList(
          context?.history
            ?.recentEndingStyles
        ),

      recentProductIds:
        normalizeProductList(
          context?.history
            ?.recentProductIds
        ),

      recentFormatSignatures:
        normalizeProductList(
          context?.history
            ?.recentFormatSignatures
        ),

      recentFormats:
        normalizeProductList(
          context?.history
            ?.recentFormats
        )
          .map(
            normalizeFormatForContext
          )
          .filter(Boolean),
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

    ...(currentTopic
      ? { currentTopic }
      : {}),
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
    "세 초안 모두 publishing.targetFormat 범위 안에서 작성하되 세부 표현과 도입부는 서로 겹치지 않게 작성하세요.",
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
      "history의 구조화된 메타데이터를 사용해 최근 contentType, topic, emotion, hookStyle, endingStyle의 반복을 피하세요.",
      "todayQuestionCount를 참고해 질문형 마무리가 과도하게 반복되지 않게 하세요.",
      "todayProductConnectedCount와 todayAffiliateLinkCount를 참고해 제품 콘텐츠와 링크 사용을 조절하세요.",
      "recentProductIds를 참고해 최근 사용 제품의 반복을 피하세요.",
      "publishing.targetFormat은 코드가 최근 포맷을 분석해 선택한 이번 글의 필수 문장·문단 구조입니다.",
      "targetFormat.prompt와 patterns를 따르고 recentFormatSignatures 및 recentFormats와 같은 문단 패턴을 반복하지 마세요.",
      "제품 글을 작성할 때는 products의 실제 데이터만 사용하세요.",
      "제품 경험이 없거나 정보가 부족하면 일반 글을 작성하세요.",
      "affiliateLink가 비어 있거나 linkEnabled가 false라면 firstComment에 링크를 만들지 마세요.",
      "publishing.questionAvailable이 false면 질문형 마무리를 사용하지 마세요.",
      "publishing.productConnectedAvailable이 false면 제품이 핵심인 글을 작성하지 마세요.",
      "publishing.affiliateLinkAvailable이 false면 제휴 링크와 광고 고지가 필요한 글을 작성하지 마세요.",
      "",
      "[THREAD_CONTEXT_JSON]",
      JSON.stringify(
        contextData,
        null,
        2
      ),
      "[/THREAD_CONTEXT_JSON]"
    );

    if (contextData.currentTopic) {
      lines.push(
        "",
        "currentTopic is a factual basis for a natural persona observation, not a news summary.",
        "Use only verifiedFacts as factual support, use at most one fact naturally, and do not invent numbers, dates, launch details, product features, or certainty.",
        "Do not claim direct use, attendance, or personal experience. Do not start as a news report or say you saw it in the news.",
        "Use personaRelevance as everyday context and selectedAngle as the main angle. Follow forbiddenClaims and keep facts, curiosity, and preference clearly distinct."
      );
    }
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
      "30대 중후반 직장인의 담백하고 현실적인 말투",
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

                          contentType: {
                            type:
                              "string",

                            enum: [
                              "순간 공감형",
                              "현실 고민형",
                              "작은 발견형",
                              "실패·실수형",
                              "의견·선택형",
                              "생활 정보형",
                              "제품 발견형",
                              "제품 경험형",
                              "제품 연결형",
                            ],
                          },

                          topic: {
                            type:
                              "string",
                          },

                          emotion: {
                            type:
                              "string",
                          },

                          hookStyle: {
                            type:
                              "string",
                          },

                          endingStyle: {
                            type:
                              "string",
                          },

                          questionUsed: {
                            type:
                              "boolean",
                          },

                          productId: {
                            anyOf: [
                              {
                                type:
                                  "string",
                              },
                              {
                                type:
                                  "null",
                              },
                            ],
                          },

                          productConnected: {
                            type:
                              "boolean",
                          },

                          affiliateLinkUsed: {
                            type:
                              "boolean",
                          },

                          affiliateDisclosureRequired: {
                            type:
                              "boolean",
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
                          "contentType",
                          "topic",
                          "emotion",
                          "hookStyle",
                          "endingStyle",
                          "questionUsed",
                          "productId",
                          "productConnected",
                          "affiliateLinkUsed",
                          "affiliateDisclosureRequired",
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
    "30대 중후반 직장인의 담백하고 현실적인 말투";

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

    contentType:
      selected.contentType,

    topic:
      selected.topic,

    emotion:
      selected.emotion,

    hookStyle:
      selected.hookStyle,

    endingStyle:
      selected.endingStyle,

    questionUsed:
      selected.questionUsed,

    productId:
      selected.productId,

    productConnected:
      selected.productConnected,

    affiliateLinkUsed:
      selected.affiliateLinkUsed,

    affiliateDisclosureRequired:
      selected
        .affiliateDisclosureRequired,

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

      currentTopicId:
        context?.currentTopic
          ?.topicId ||
        null,

      currentTopicCategory:
        context?.currentTopic
          ?.category ||
        null,

      currentTopicSubject:
        context?.currentTopic
          ?.subject ||
        null,

      selectedAngle:
        context?.currentTopic
          ?.selectedAngle ||
        null,

      recordData:
        parsedPost.recordData,
    },
  };
}
