import { getJson } from "../kv.js";
import { getThreadsProfile, publishImagePost, publishTextPost } from "../threads.js";

export class ThreadsPublisherError extends Error {
  constructor(message, { code = "PUBLISH_FAILED", status = 400 } = {}) {
    super(message);
    this.name = "ThreadsPublisherError";
    this.code = code;
    this.status = status;
  }
}

export const threadsPublisher = {
  provider: "THREADS",
  supportedFormats: ["TEXT"],
  async publish({ env, content, format, context = {}, dependencies = {} }) {
    if (format !== "TEXT") {
      throw new ThreadsPublisherError("This format is not supported by Threads", {
        code: "FORMAT_NOT_SUPPORTED",
      });
    }

    const readJson = dependencies.getJson || getJson;
    const loadProfile = dependencies.getThreadsProfile || getThreadsProfile;
    const publishImage = dependencies.publishImagePost || publishImagePost;
    const publishText = dependencies.publishTextPost || publishTextPost;
    const mediaSelection = context.mediaSelection || { mode: "TEXT", mediaId: null };
    if (mediaSelection.mode !== "TEXT" && mediaSelection.mode !== "IMAGE") {
      throw new ThreadsPublisherError("This media mode is not supported by Threads", {
        code: "FORMAT_NOT_SUPPORTED",
      });
    }
    const auth = await readJson(env, "threads_auth");
    if (!auth?.access_token) {
      throw new ThreadsPublisherError("Threads account is not connected", {
        code: "threads_auth_missing",
      });
    }

    try {
      const profile = await loadProfile(auth.access_token);
      const published = mediaSelection.mode === "IMAGE"
        ? await publishImage(env, auth.access_token, profile.id, content, mediaSelection.mediaId)
        : await publishText(auth.access_token, profile.id, content);
      return {
        provider: "THREADS",
        externalPostId: published.postId,
        publishedAt: new Date().toISOString(),
        // Internal log context only. It is not returned from the operator API.
        logUsername: profile.username,
        publisherUserId: profile.id,
      };
    } catch (error) {
      console.error("Threads publisher adapter failed", {
        step: error?.step || "threads_publish",
      });
      throw new ThreadsPublisherError("Threads publishing failed. Please try again later.", {
        code: "PUBLISH_FAILED",
      });
    }
  },
};
