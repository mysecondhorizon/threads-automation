import { THREADS_SYSTEM_PROMPT } from "../prompts/threads/index.js";
const OPENAI_RESPONSES_URL =
  "https://api.openai.com/v1/responses";

export class AiServiceError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "AiServiceError";
    this.details = details;
  }
}

function extractOutputText(data) {
  const texts = [];

  for (const item of data.output || []) {
    if (item.type !== "message") {
      continue;
    }

    for (const content of item.content || []) {
      if (
        content.type === "output_text" &&
        typeof content.text === "string"
      ) {
        texts.push(content.text);
      }
    }
  }

  return texts.join("\n").trim();
}

export async function generateThreadsDrafts(
  env,
  {
    topic,
    tone = "친근하고 통찰력 있는",
  }
) {
  if (!env.OPENAI_API_KEY) {
    throw new AiServiceError(
      "OPENAI_API_KEY is not configured"
    );
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6",
      store: false,

      reasoning: {
        effort: "low",
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
          type: "json_schema",
          name: "threads_drafts",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              drafts: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    style: {
                      type: "string",
                      enum: [
                        "전문가형",
                        "스토리형",
                        "후킹형",
                      ],
                    },
                    text: {
                      type: "string",
                    },
                  },
                  required: ["style", "text"],
                },
              },
            },
            required: ["drafts"],
          },
        },
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new AiServiceError(
      "OpenAI request failed",
      data
    );
  }

  const outputText = extractOutputText(data);

  if (!outputText) {
    throw new AiServiceError(
      "OpenAI returned no text",
      data
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new AiServiceError(
      "OpenAI returned invalid JSON",
      { outputText }
    );
  }

  if (
    !Array.isArray(parsed.drafts) ||
    parsed.drafts.length !== 3
  ) {
    throw new AiServiceError(
      "OpenAI returned an invalid draft list",
      parsed
    );
  }

  return parsed.drafts.map((draft) => ({
    style: draft.style,
    text: String(draft.text).trim().slice(0, 500),
  }));
}
