import {
  getThreadsProfile,
  publishTextPost,
} from "../threads.js";

import {
  logPostSuccess,
} from "../logger.js";

export async function publishAutoPost(
  env,
  {
    accessToken,
    text,
  }
) {
  const profile =
    await getThreadsProfile(
      accessToken
    );

  const publishResult =
    await publishTextPost(
      accessToken,
      profile.id,
      text
    );

  await logPostSuccess(
    env,
    profile.username,
    publishResult.postId,
    text
  );

  return {
    profile,

    publishResult,
  };
}