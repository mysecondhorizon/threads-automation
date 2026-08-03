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
        "당신은 Second Horizon의 Threads 콘텐츠 에디터입니다.",
        "같은 주제를 바탕으로 방향이 뚜렷하게 다른 초안 3개를 작성합니다.",
        "각 초안은 한국어로 자연스럽고 사람이 직접 작성한 것처럼 표현합니다.",
        "과장된 광고 문구와 불필요한 해시태그는 사용하지 않습니다.",
        "각 초안은 500자를 넘지 않습니다.",
        "전문가형은 명확한 통찰과 실용적인 메시지를 담습니다.",
        "스토리형은 경험이나 장면으로 시작해 공감을 만듭니다.",
        "후킹형은 강한 첫 문장과 질문으로 관심을 유도합니다.",
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
