import assert from "node:assert/strict";

import {
  logPostSuccess,
  updatePostLogFirstComment,
} from "./logger.js";
import { getPostingHistory } from "./history.js";
import {
  buildAnalyticsSummary,
  buildRecentPerformance,
} from "./analytics.js";

class MemoryKv {
  constructor() {
    this.values = new Map();
  }

  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async list({ prefix = "" } = {}) {
    return {
      keys: [...this.values.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
    };
  }
}

const kv = new MemoryKv();
const env = { THREADS_KV: kv };

const userExperienceKey = await logPostSuccess(
  env,
  "auto",
  "post-user-experience",
  "A grounded post.",
  { source:"cron_auto_general", contentBasis:"USER_EXPERIENCE" }
);
const currentTopicKey = await logPostSuccess(
  env,
  "auto",
  "post-current-topic",
  "A current topic post.",
  { source:"cron_auto_general", contentBasis:"CURRENT_TOPIC" }
);
const personaKey = await logPostSuccess(
  env,
  "auto",
  "post-persona",
  "A persona post.",
  { source:"cron_auto_general", contentBasis:"PERSONA" }
);
const invalidKey = await logPostSuccess(
  env,
  "auto",
  "post-invalid",
  "An invalid basis post.",
  { source:"cron_auto_general", contentBasis:"NOT_A_BASIS" }
);
const missingKey = await logPostSuccess(
  env,
  "auto",
  "post-missing",
  "A missing basis post.",
  { source:"cron_auto_general" }
);

assert.equal((await kv.get(userExperienceKey, "json")).metadata.contentBasis, "USER_EXPERIENCE");
assert.equal((await kv.get(currentTopicKey, "json")).metadata.contentBasis, "CURRENT_TOPIC");
assert.equal((await kv.get(personaKey, "json")).metadata.contentBasis, "PERSONA");
assert.equal((await kv.get(invalidKey, "json")).metadata.contentBasis, null);
assert.equal((await kv.get(missingKey, "json")).metadata.contentBasis, null);

await updatePostLogFirstComment(env, userExperienceKey, { topicApplied:true });
assert.equal((await kv.get(userExperienceKey, "json")).metadata.contentBasis, "USER_EXPERIENCE");

const history = await getPostingHistory(env);
assert.equal(
  history.recentSevenDayPosts.find((post) => post.postId === "post-user-experience").contentBasis,
  "USER_EXPERIENCE"
);
assert.equal(
  history.recentSevenDayPosts.find((post) => post.postId === "post-missing").contentBasis,
  null
);
assert.equal(
  history.recentSevenDayPosts.find((post) => post.postId === "post-invalid").contentBasis,
  null
);

await kv.put("post_insight:post-current-topic", JSON.stringify({ views:100, interactions:10 }));
await kv.put("post_insight:post-user-experience", JSON.stringify({ views:200, interactions:30 }));
await kv.put("post_insight:post-persona", JSON.stringify({ views:300, interactions:50 }));
await kv.put("post_insight:post-legacy", JSON.stringify({ views:400, interactions:60 }));
const performance = await buildRecentPerformance(env, [
  { postId:"post-current-topic", createdAt:"2026-09-07T00:00:00.000Z", text:"Current", contentBasis:"CURRENT_TOPIC" },
  { postId:"post-user-experience", createdAt:"2026-09-07T00:00:00.000Z", text:"Experience one", contentBasis:"USER_EXPERIENCE" },
  { postId:"post-persona", createdAt:"2026-09-07T00:00:00.000Z", text:"Experience two", contentBasis:"USER_EXPERIENCE" },
  { postId:"post-legacy", createdAt:"2026-09-07T00:00:00.000Z", text:"Legacy", contentBasis:null },
  { postId:"post-no-insight", createdAt:"2026-09-07T00:00:00.000Z", text:"No insight", contentBasis:"PERSONA" },
]);
assert.equal(performance.find((item) => item.postId === "post-no-insight").contentBasis, "PERSONA");

const summary = buildAnalyticsSummary(performance);
assert.deepEqual(summary.byContentBasis, [
  { key:"USER_EXPERIENCE", count:2, totalViews:500, totalInteractions:80, averageViews:250, averageEngagementRate:0 },
  { key:"CURRENT_TOPIC", count:1, totalViews:100, totalInteractions:10, averageViews:100, averageEngagementRate:0 },
]);
assert.deepEqual(buildAnalyticsSummary([]).byContentBasis, []);

console.log("content basis learning fixtures passed");
