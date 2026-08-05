export class AutoPostEngineError extends Error {
  constructor(
    message,
    {
      code = "auto_post_failed",
      status = 500,
      step = "unknown",
      details = null,
      text = "",
      cause = null,
    } = {}
  ) {
    super(
      message,
      cause
        ? {
            cause,
          }
        : undefined
    );

    this.name =
      "AutoPostEngineError";

    this.code =
      code;

    this.status =
      status;

    this.step =
      step;

    this.details =
      details;

    this.text =
      text;
  }
}

export function serializeAutoPostError(
  error
) {
  if (
    error instanceof Error
  ) {
    return {
      name:
        error.name,

      message:
        error.message,
    };
  }

  return {
    name:
      "UnknownError",

    message:
      String(error),
  };
}