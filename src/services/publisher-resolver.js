import { BUILT_IN_THREADS_APP_ID, getApp } from "./apps.js";
import { threadsPublisher } from "./publishers/threads-publisher.js";

export class PublisherResolutionError extends Error {
  constructor(message, { code, status = 400 } = {}) {
    super(message);
    this.name = "PublisherResolutionError";
    this.code = code;
    this.status = status;
  }
}

const PUBLISHERS_BY_TYPE = Object.freeze({
  THREADS: threadsPublisher,
});

export const PUBLISHER_CAPABILITIES = Object.freeze({
  THREADS: Object.freeze(["TEXT"]),
  WORDPRESS: Object.freeze(["TEXT", "HTML"]),
  CUSTOM_API: Object.freeze(["TEXT", "HTML"]),
});

// app.active remains configuration metadata in R11B. Enforcing it would
// change existing production publishing behavior and requires a product decision.
export async function resolvePublisher({ env, targetApp, format, dependencies = {} }) {
  const appId = targetApp === null || targetApp === undefined
    ? BUILT_IN_THREADS_APP_ID
    : targetApp;
  const readApp = dependencies.getApp || getApp;
  const app = await readApp(env, appId);
  if (!app) {
    throw new PublisherResolutionError("Target app was not found", {
      code: "APP_NOT_FOUND",
      status: 404,
    });
  }

  const publisher = PUBLISHERS_BY_TYPE[app.type];
  if (!publisher) {
    throw new PublisherResolutionError("Publisher is not supported for this app", {
      code: "PUBLISHER_NOT_SUPPORTED",
    });
  }
  if (!publisher.supportedFormats.includes(format)) {
    throw new PublisherResolutionError("Post format is not supported by this publisher", {
      code: "FORMAT_NOT_SUPPORTED",
    });
  }
  return { app, publisher };
}
