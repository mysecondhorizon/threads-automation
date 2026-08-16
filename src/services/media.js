import {
  getJson,
  putJson,
} from "./kv.js";

const MEDIA_LIBRARY_KEY =
  "content_media_library";

const MEDIA_LIBRARY_VERSION =
  1;

const MAX_MEDIA_RECORDS =
  500;

const MAX_OBJECT_KEY_BYTES =
  1024;

const MAX_ALT_TEXT_LENGTH =
  1000;

const MAX_DESCRIPTION_LENGTH =
  4000;

const MAX_IMAGE_URL_LENGTH =
  8192;

const SOURCE_TYPES =
  new Set([
    "general",
    "product",
  ]);

export class MediaLibraryError extends Error {
  constructor(
    message,
    {
      code = "media_library_failed",
      details = null,
    } = {}
  ) {
    super(message);

    this.name =
      "MediaLibraryError";

    this.code =
      code;

    this.details =
      details;
  }
}

function createMediaLibraryError(
  message,
  code,
  details = null
) {
  return new MediaLibraryError(
    message,
    {
      code,
      details,
    }
  );
}

function normalizeText(
  value
) {
  return String(
    value ?? ""
  ).trim();
}

function normalizeNullableText(
  value
) {
  const normalized =
    normalizeText(value);

  return normalized || null;
}

function normalizeSourceType(
  value,
  fallback = "general"
) {
  const normalized =
    normalizeText(
      value ?? fallback
    ).toLowerCase();

  if (
    !SOURCE_TYPES.has(
      normalized
    )
  ) {
    throw createMediaLibraryError(
      "Media sourceType must be general or product",
      "media_source_type_invalid",
      {
        sourceType:
          normalized || null,
      }
    );
  }

  return normalized;
}

function normalizeActive(
  value,
  fallback = true
) {
  if (
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value !==
    "boolean"
  ) {
    throw createMediaLibraryError(
      "Media active must be a boolean",
      "media_active_invalid"
    );
  }

  return value;
}

function getUtf8ByteLength(
  value
) {
  return new TextEncoder()
    .encode(value)
    .byteLength;
}

function normalizeObjectKey(
  value
) {
  const objectKey =
    normalizeText(value);

  if (!objectKey) {
    throw createMediaLibraryError(
      "Media objectKey is required",
      "media_object_key_missing"
    );
  }

  if (
    getUtf8ByteLength(
      objectKey
    ) > MAX_OBJECT_KEY_BYTES
  ) {
    throw createMediaLibraryError(
      "Media objectKey exceeds the R2 size limit",
      "media_object_key_too_long"
    );
  }

  if (
    /[\u0000-\u001f\u007f]/u.test(
      objectKey
    ) ||
    objectKey.startsWith("/") ||
    objectKey.endsWith("/") ||
    objectKey.includes("\\")
  ) {
    throw createMediaLibraryError(
      "Media objectKey is invalid",
      "media_object_key_invalid"
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
    throw createMediaLibraryError(
      "Media objectKey contains an invalid path segment",
      "media_object_key_invalid"
    );
  }

  return objectKey;
}

function normalizeImageUrl(
  value
) {
  const imageUrl =
    normalizeNullableText(value);

  if (!imageUrl) {
    return null;
  }

  if (
    imageUrl.length >
    MAX_IMAGE_URL_LENGTH
  ) {
    throw createMediaLibraryError(
      "Media imageUrl is too long",
      "media_image_url_too_long"
    );
  }

  let parsedUrl;

  try {
    parsedUrl =
      new URL(imageUrl);
  } catch {
    throw createMediaLibraryError(
      "Media imageUrl must be a valid URL",
      "media_image_url_invalid"
    );
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.protocol !== "http:"
  ) {
    throw createMediaLibraryError(
      "Media imageUrl must use HTTP or HTTPS",
      "media_image_url_invalid"
    );
  }

  return imageUrl;
}

function normalizeLimitedText(
  value,
  field,
  maxLength
) {
  const normalized =
    normalizeText(value);

  if (
    normalized.length >
    maxLength
  ) {
    throw createMediaLibraryError(
      `Media ${field} is too long`,
      `media_${field}_too_long`
    );
  }

  return normalized;
}

function createMediaId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto
      .randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 12),
  ].join("-");
}

function normalizeMediaRecord(
  input,
  existingMedia = null
) {
  const now =
    new Date().toISOString();

  const sourceType =
    normalizeSourceType(
      input?.sourceType,
      existingMedia?.sourceType ||
        "general"
    );

  const requestedProductId =
    input?.productId === undefined
      ? existingMedia?.productId
      : input.productId;

  return {
    id:
      existingMedia?.id ||
      createMediaId(),

    sourceType,

    productId:
      sourceType === "product"
        ? normalizeNullableText(
            requestedProductId
          )
        : null,

    objectKey:
      normalizeObjectKey(
        input?.objectKey ===
          undefined
          ? existingMedia
              ?.objectKey
          : input.objectKey
      ),

    imageUrl:
      normalizeImageUrl(
        input?.imageUrl ===
          undefined
          ? existingMedia
              ?.imageUrl
          : input.imageUrl
      ),

    altText:
      normalizeLimitedText(
        input?.altText ===
          undefined
          ? existingMedia
              ?.altText
          : input.altText,
        "alt_text",
        MAX_ALT_TEXT_LENGTH
      ),

    description:
      normalizeLimitedText(
        input?.description ===
          undefined
          ? existingMedia
              ?.description
          : input.description,
        "description",
        MAX_DESCRIPTION_LENGTH
      ),

    active:
      normalizeActive(
        input?.active,
        existingMedia?.active ??
          true
      ),

    createdAt:
      existingMedia?.createdAt ||
      now,

    updatedAt:
      now,
  };
}

function normalizeStoredMedia(
  input
) {
  const sourceType =
    SOURCE_TYPES.has(
      input?.sourceType
    )
      ? input.sourceType
      : "general";

  return {
    id:
      normalizeText(
        input?.id
      ),

    sourceType,

    productId:
      sourceType === "product"
        ? normalizeNullableText(
            input?.productId
          )
        : null,

    objectKey:
      normalizeText(
        input?.objectKey
      ),

    imageUrl:
      normalizeNullableText(
        input?.imageUrl
      ),

    altText:
      normalizeText(
        input?.altText
      ),

    description:
      normalizeText(
        input?.description
      ),

    active:
      input?.active !== false,

    createdAt:
      normalizeNullableText(
        input?.createdAt
      ),

    updatedAt:
      normalizeNullableText(
        input?.updatedAt
      ),
  };
}

async function readMediaStore(
  env
) {
  const stored =
    await getJson(
      env,
      MEDIA_LIBRARY_KEY
    );

  if (
    !stored ||
    !Array.isArray(
      stored.records
    )
  ) {
    return {
      version:
        MEDIA_LIBRARY_VERSION,

      updatedAt:
        null,

      records:
        [],
    };
  }

  return {
    version:
      Number(
        stored.version ||
        MEDIA_LIBRARY_VERSION
      ),

    updatedAt:
      stored.updatedAt ||
      null,

    records:
      stored.records
        .map(
          normalizeStoredMedia
        )
        .filter(
          (media) =>
            media.id &&
            media.objectKey
        ),
  };
}

async function writeMediaStore(
  env,
  records
) {
  const value = {
    version:
      MEDIA_LIBRARY_VERSION,

    updatedAt:
      new Date().toISOString(),

    records,
  };

  await putJson(
    env,
    MEDIA_LIBRARY_KEY,
    value
  );

  return value;
}

function assertUniqueObjectKey(
  records,
  media
) {
  const duplicate =
    records.find(
      (item) =>
        item.id !== media.id &&
        item.objectKey ===
          media.objectKey
    );

  if (duplicate) {
    throw createMediaLibraryError(
      "Media objectKey is already registered",
      "media_object_key_duplicate",
      {
        objectKey:
          media.objectKey,
        mediaId:
          duplicate.id,
      }
    );
  }
}

function normalizeListOptions(
  options
) {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw createMediaLibraryError(
      "Media list options must be an object",
      "media_list_options_invalid"
    );
  }

  const sourceType =
    options.sourceType ===
      undefined
      ? null
      : normalizeSourceType(
          options.sourceType
        );

  let active = null;

  if (
    options.active !==
    undefined
  ) {
    active =
      normalizeActive(
        options.active
      );
  }

  const hasProductId =
    options.productId !==
    undefined;

  return {
    sourceType,
    active,
    hasProductId,
    productId:
      hasProductId
        ? normalizeNullableText(
            options.productId
          )
        : null,
  };
}

export async function createMedia(
  env,
  input
) {
  const store =
    await readMediaStore(env);

  if (
    store.records.length >=
    MAX_MEDIA_RECORDS
  ) {
    throw createMediaLibraryError(
      "Media Library has reached its record limit",
      "media_library_limit_reached",
      {
        limit:
          MAX_MEDIA_RECORDS,
      }
    );
  }

  const media =
    normalizeMediaRecord(input);

  assertUniqueObjectKey(
    store.records,
    media
  );

  await writeMediaStore(
    env,
    [
      media,
      ...store.records,
    ]
  );

  return media;
}

export async function getMedia(
  env,
  mediaId
) {
  const normalizedId =
    normalizeText(mediaId);

  if (!normalizedId) {
    return null;
  }

  const store =
    await readMediaStore(env);

  return (
    store.records.find(
      (media) =>
        media.id ===
        normalizedId
    ) ||
    null
  );
}

export async function listMedia(
  env,
  options = {}
) {
  const filters =
    normalizeListOptions(options);

  const store =
    await readMediaStore(env);

  return store.records.filter(
    (media) => {
      if (
        filters.sourceType &&
        media.sourceType !==
          filters.sourceType
      ) {
        return false;
      }

      if (
        filters.active !== null &&
        media.active !==
          filters.active
      ) {
        return false;
      }

      if (
        filters.hasProductId &&
        media.productId !==
          filters.productId
      ) {
        return false;
      }

      return true;
    }
  );
}

export async function updateMedia(
  env,
  mediaId,
  input
) {
  const normalizedId =
    normalizeText(mediaId);

  if (!normalizedId) {
    throw createMediaLibraryError(
      "Media id is required",
      "media_id_missing"
    );
  }

  const store =
    await readMediaStore(env);

  const existingIndex =
    store.records.findIndex(
      (media) =>
        media.id ===
        normalizedId
    );

  if (existingIndex < 0) {
    throw createMediaLibraryError(
      "Media record was not found",
      "media_not_found",
      {
        mediaId:
          normalizedId,
      }
    );
  }

  const existingMedia =
    store.records[
      existingIndex
    ];

  const media =
    normalizeMediaRecord(
      input,
      existingMedia
    );

  assertUniqueObjectKey(
    store.records,
    media
  );

  const nextRecords = [
    ...store.records,
  ];

  nextRecords[
    existingIndex
  ] = media;

  await writeMediaStore(
    env,
    nextRecords
  );

  return media;
}

export async function removeMedia(
  env,
  mediaId
) {
  const normalizedId =
    normalizeText(mediaId);

  if (!normalizedId) {
    return false;
  }

  const store =
    await readMediaStore(env);

  const nextRecords =
    store.records.filter(
      (media) =>
        media.id !==
        normalizedId
    );

  if (
    nextRecords.length ===
    store.records.length
  ) {
    return false;
  }

  await writeMediaStore(
    env,
    nextRecords
  );

  return true;
}
