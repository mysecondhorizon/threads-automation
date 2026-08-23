const MEDIA_BUCKET_BINDING =
  "THREADS_MEDIA";

const MAX_OBJECT_KEY_BYTES =
  1024;
const MAX_DIAGNOSTIC_MESSAGE_LENGTH =
  256;
const MAX_DIAGNOSTIC_STACK_LENGTH =
  512;

const REQUIRED_BUCKET_METHODS = [
  "put",
  "get",
  "head",
  "delete",
];

export class MediaStorageError extends Error {
  constructor(
    message,
    {
      code = "media_storage_failed",
      operation = "unknown",
      objectKey = null,
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
      "MediaStorageError";

    this.code =
      code;

    this.operation =
      operation;

    this.objectKey =
      objectKey;
  }
}

function createValidationError(
  message,
  code,
  objectKey = null
) {
  return new MediaStorageError(
    message,
    {
      code,
      operation:
        "validate",
      objectKey,
    }
  );
}

function getUtf8ByteLength(
  value
) {
  return new TextEncoder()
    .encode(value)
    .byteLength;
}

function boundedDiagnosticValue(
  value,
  maxLength = MAX_DIAGNOSTIC_MESSAGE_LENGTH
) {
  return String(
    value ??
    ""
  )
    .replace(/\s+/gu, " ")
    .slice(0, maxLength);
}

function describePutBody(
  body
) {
  const isReadableStream = Boolean(
    body &&
    typeof body.getReader === "function"
  );
  const constructorName = body?.constructor?.name ||
    Object.prototype.toString.call(body);
  const knownLength = Number.isSafeInteger(body?.byteLength)
    ? body.byteLength
    : Number.isSafeInteger(body?.length)
      ? body.length
      : "unknown";
  return {
    type: isReadableStream
      ? "ReadableStream"
      : constructorName,
    constructor: constructorName,
    locked: isReadableStream && typeof body.locked === "boolean"
      ? body.locked
      : "unknown",
    byob: typeof body?.supportsBYOB === "boolean"
      ? body.supportsBYOB
      : body?.type === "bytes"
        ? true
        : "unknown",
    knownLength,
  };
}

export function normalizeMediaObjectKey(
  value
) {
  const objectKey =
    String(
      value ?? ""
    ).trim();

  if (!objectKey) {
    throw createValidationError(
      "Media object key is required",
      "media_object_key_missing"
    );
  }

  if (
    getUtf8ByteLength(
      objectKey
    ) > MAX_OBJECT_KEY_BYTES
  ) {
    throw createValidationError(
      "Media object key exceeds the R2 size limit",
      "media_object_key_too_long",
      objectKey
    );
  }

  if (
    /[\u0000-\u001f\u007f]/u.test(
      objectKey
    )
  ) {
    throw createValidationError(
      "Media object key contains control characters",
      "media_object_key_invalid",
      objectKey
    );
  }

  if (
    objectKey.startsWith("/") ||
    objectKey.endsWith("/") ||
    objectKey.includes("\\")
  ) {
    throw createValidationError(
      "Media object key must be a relative forward-slash path",
      "media_object_key_invalid",
      objectKey
    );
  }

  const segments =
    objectKey.split("/");

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".."
    )
  ) {
    throw createValidationError(
      "Media object key contains an invalid path segment",
      "media_object_key_invalid",
      objectKey
    );
  }

  return objectKey;
}

export function getMediaBucket(
  env
) {
  const bucket =
    env?.[MEDIA_BUCKET_BINDING];

  if (!bucket) {
    throw new MediaStorageError(
      "Cloudflare R2 media binding is missing",
      {
        code:
          "media_storage_binding_missing",
        operation:
          "binding",
      }
    );
  }

  const invalidMethod =
    REQUIRED_BUCKET_METHODS.find(
      (method) =>
        typeof bucket[method] !==
        "function"
    );

  if (invalidMethod) {
    throw new MediaStorageError(
      "Cloudflare R2 media binding is invalid",
      {
        code:
          "media_storage_binding_invalid",
        operation:
          "binding",
      }
    );
  }

  return bucket;
}

async function runMediaStorageOperation(
  operation,
  objectKey,
  callback,
  diagnostics = null
) {
  try {
    return await callback();
  } catch (error) {
    if (
      error instanceof
      MediaStorageError
    ) {
      throw error;
    }

    if (operation === "put") {
      const cause = error?.cause;
      const bodyDescription = describePutBody(diagnostics?.body);
      console.error(
        `[media-storage] original put failure key=${objectKey} ` +
        `errorName=${boundedDiagnosticValue(error?.name || "Error")} ` +
        `message=${boundedDiagnosticValue(error?.message || error)} ` +
        `code=${boundedDiagnosticValue(error?.code || "unknown")} ` +
        `causeName=${boundedDiagnosticValue(cause?.name || "unknown")} ` +
        `causeMessage=${boundedDiagnosticValue(cause?.message || "unknown")} ` +
        `bodyType=${boundedDiagnosticValue(bodyDescription.type)} ` +
        `constructor=${boundedDiagnosticValue(bodyDescription.constructor)} ` +
        `locked=${String(bodyDescription.locked)} ` +
        `byob=${String(bodyDescription.byob)} ` +
        `knownLength=${String(bodyDescription.knownLength)} ` +
        `stack=${boundedDiagnosticValue(error?.stack, MAX_DIAGNOSTIC_STACK_LENGTH)}`
      );
    }

    throw new MediaStorageError(
      `Media storage ${operation} failed`,
      {
        code:
          `media_storage_${operation}_failed`,
        operation,
        objectKey,
        cause:
          error,
      }
    );
  }
}

export async function putMediaObject(
  env,
  objectKey,
  body,
  options = {}
) {
  const normalizedObjectKey =
    normalizeMediaObjectKey(
      objectKey
    );

  if (
    body === null ||
    body === undefined
  ) {
    throw createValidationError(
      "Media object body is required",
      "media_object_body_missing",
      normalizedObjectKey
    );
  }

  return await runMediaStorageOperation(
    "put",
    normalizedObjectKey,
    async () => {
      const bucket =
        getMediaBucket(env);

      return await bucket.put(
        normalizedObjectKey,
        body,
        options
      );
    },
    { body }
  );
}

export async function getMediaObject(
  env,
  objectKey,
  options = {}
) {
  const normalizedObjectKey =
    normalizeMediaObjectKey(
      objectKey
    );

  return await runMediaStorageOperation(
    "get",
    normalizedObjectKey,
    async () => {
      const bucket =
        getMediaBucket(env);

      return await bucket.get(
        normalizedObjectKey,
        options
      );
    }
  );
}

export async function headMediaObject(
  env,
  objectKey
) {
  const normalizedObjectKey =
    normalizeMediaObjectKey(
      objectKey
    );

  return await runMediaStorageOperation(
    "head",
    normalizedObjectKey,
    async () => {
      const bucket =
        getMediaBucket(env);

      return await bucket.head(
        normalizedObjectKey
      );
    }
  );
}

export async function deleteMediaObject(
  env,
  objectKey
) {
  const normalizedObjectKey =
    normalizeMediaObjectKey(
      objectKey
    );

  return await runMediaStorageOperation(
    "delete",
    normalizedObjectKey,
    async () => {
      const bucket =
        getMediaBucket(env);

      return await bucket.delete(
        normalizedObjectKey
      );
    }
  );
}
