import {
  THREADS_SYSTEM_PROMPT,
} from "../prompts/threads/index.js";

const OPENAI_RESPONSES_URL =
  "https://api.openai.com/v1/responses";

const GENERATED_SECTION_PATTERN =
  /^\s*\[(글 유형|본문|첫 댓글|기록 데이터)\]\s*$/gm;

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

function normalizeFirstComment(
  value
) {
  const comment =
    normalizeLineBreaks(
      value
    );

  if (
    !comment ||
    comment === "없음" ||
    comment === "해당 없음" ||
    comment.toLowerCase() ===
      "none"
  ) {
    return "";
  }

  return comment;
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
      raw: "",
      fields: {},
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

  if (
    !hasStructuredSections(
      rawText
    )
  ) {
    return {
      body:
        rawText,

      postType:
        String(
          selected?.style ||
          ""
        ).trim(),

      firstComment:
        "",

      recordData: {
        raw:
          "",

        fields:
          {},
      },

      sourceFormat:
        "plain_text",
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

  return {
    body,

    postType:
      sectionPostType ||
      String(
        selected?.style ||
        ""
      ).trim(),

    firstComment:
      normalizeFirstComment(
        sections?.["첫 댓글"]
      ),

    recordData:
      parseRecordData(
        sections?.["기록 데이터"]
      ),

    sourceFormat:
      "labeled_sections",
  };
}

export async function generateThreadsDrafts(
  env,
  {
    topic,
    tone =
      "친근하고 통찰력 있는",
  }
) {
  if (
    !env.OPENAI_API_KEY
  ) {
    throw new AiServiceError(
      "OPENAI_API_KEY is not configured"
    );
  }

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

            instructions: [
              THREADS_SYSTEM_PROMPT,
            ].join("\n"),

            input: [
              `주제: ${topic}`,
              `기본 톤: ${tone}`,
              "세 초안의 문장 구조와 도입부가 서로 겹치지 않게 작성하세요.",
            ].join("\n"),

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
                        },

                        required: [
                          "style",
                          "text",
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
    (draft) => ({
      style:
        String(
          draft.style || ""
        ).trim(),

      text:
        normalizeLineBreaks(
          draft.text
        ),
    })
  );
}

export async function generateThreadPost(
  env,
  context
) {
  const topic =
    context?.publishing?.goal ||
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

      recordData:
        parsedPost.recordData,
    },
  };
}