import assert from "node:assert/strict";

import {
  calculateOpportunityScore,
  discoverProductOpportunities,
} from "./product-opportunity-discovery.js";

const at = new Date("2026-09-08T00:00:00.000Z");

function candidate(overrides = {}) {
  return {
    productName: "Compact coffee grinder",
    brand: "Example Brand",
    category: "coffee",
    problem: "Morning coffee setup takes too much counter space.",
    audience: "Office workers who make coffee at home.",
    situation: "Preparing a quick weekday coffee before a commute.",
    angle: "A small practical upgrade for a repeated morning routine.",
    discoveryReason: "Current coffee-category interest and compact-home convenience signals overlap.",
    signalSources: ["https://signals.example/one", "https://signals.example/two"],
    sourceUrl: "https://signals.example/one",
    trendScore: 80,
    personaFitScore: 80,
    purchaseIntentScore: 80,
    contentPotentialScore: 80,
    experiencePotentialScore: 80,
    affiliatePotentialScore: 80,
    ...overrides,
  };
}

async function run(candidates, overrides = {}) {
  const saved = [];
  let options = null;
  const topics = [{ category: "consumer_lifestyle", subject: "Morning coffee routines", personaRelevance: "Practical commute routine", verifiedFacts: ["A current public signal"] }];
  const result = await discoverProductOpportunities({}, {
    workspaceId: "workspace-next",
    at,
    requestJson: async (_env, value) => { options = value; return { candidates }; },
    readInventory: async () => ({ topics }),
    list: async (_env, workspaceId) => {
      assert.equal(workspaceId, "workspace-next");
      return overrides.existing || [];
    },
    save: async (_env, value, workspaceId) => {
      assert.equal(workspaceId, "workspace-next");
      saved.push(value);
      return { ...value, id: `saved-${saved.length}`, workspaceId };
    },
  });
  return { result, saved, options, topics };
}

const score = calculateOpportunityScore(candidate({
  trendScore: 100,
  personaFitScore: 80,
  purchaseIntentScore: 60,
  contentPotentialScore: 40,
  experiencePotentialScore: 20,
  affiliatePotentialScore: 0,
}));
assert.equal(score, 51);

const valid = await run([candidate()]);
assert.equal(valid.result.savedCount, 1);
assert.equal(valid.result.recommendedCount, 1);
assert.equal(valid.saved[0].status, "RECOMMENDED");
assert.equal(valid.saved[0].opportunityScore, 80);
assert.equal(valid.saved[0].affiliateLink, null);
assert.deepEqual(valid.options.tools, [{ type: "web_search" }]);
assert.equal(valid.options.schema.properties.candidates.maxItems, 6);
assert.match(valid.options.instructions, /never USER_EXPERIENCE/u);
assert.match(valid.options.input, /Morning coffee routines/u);
assert.deepEqual(valid.topics, [{ category: "consumer_lifestyle", subject: "Morning coffee routines", personaRelevance: "Practical commute routine", verifiedFacts: ["A current public signal"] }]);

const discovered = await run([candidate({ signalSources: ["https://signals.example/one"], sourceUrl: "https://signals.example/one" })]);
assert.equal(discovered.saved[0].status, "DISCOVERED");

const lowScore = await run([candidate({
  trendScore: 100,
  personaFitScore: 80,
  purchaseIntentScore: 60,
  contentPotentialScore: 40,
  experiencePotentialScore: 20,
  affiliatePotentialScore: 0,
})]);
assert.equal(lowScore.saved[0].opportunityScore, 51);
assert.equal(lowScore.saved[0].status, "DISCOVERED");

const invalidAndWeak = await run([
  candidate({ signalSources: [] }),
  candidate({ productName: "", signalSources: ["https://signals.example/one"] }),
  candidate({ trendScore: "80" }),
  candidate({ signalSources: ["ftp://signals.example/no", "https://signals.example/one"], sourceUrl: "ftp://signals.example/no" }),
]);
assert.equal(invalidAndWeak.result.skippedInvalidCount, 3);
assert.equal(invalidAndWeak.saved.length, 1);
assert.deepEqual(invalidAndWeak.saved[0].signalSources, ["https://signals.example/one"]);
assert.equal(invalidAndWeak.saved[0].sourceUrl, "https://signals.example/one");

const noAffiliate = await run([candidate({ affiliateLink: "https://untrusted.example/affiliate" })]);
assert.equal(noAffiliate.saved[0].affiliateLink, null);

const duplicateExisting = candidate();
const existingDuplicate = { ...duplicateExisting, id: "existing", workspaceId: "workspace-next", status: "DISCOVERED" };
const duplicate = await run([duplicateExisting], { existing: [existingDuplicate] });
assert.equal(duplicate.result.savedCount, 0);
assert.equal(duplicate.result.skippedDuplicateCount, 1);

const distinctSituation = await run([
  candidate(),
  candidate({ situation: "Removing pet hair from a car after weekend walks.", problem: "Pet hair builds up in the car floor mats." }),
]);
assert.equal(distinctSituation.result.savedCount, 2);

const duplicateRun = await run([candidate(), candidate({ brand: "Different brand" })]);
assert.equal(duplicateRun.result.savedCount, 1);
assert.equal(duplicateRun.result.skippedDuplicateCount, 1);

const emptyTopics = await discoverProductOpportunities({}, {
  workspaceId: "workspace-next",
  at,
  requestJson: async (_env, options) => {
    assert.match(options.input, /"currentTopics":\[\]/u);
    return { candidates: [candidate()] };
  },
  readInventory: async () => ({ topics: [] }),
  list: async () => [],
  save: async (_env, value, workspaceId) => ({ ...value, id: "web-only", workspaceId }),
});
assert.equal(emptyTopics.savedCount, 1);

let savesAfterFailure = 0;
await assert.rejects(
  () => discoverProductOpportunities({}, {
    workspaceId: "workspace-next",
    requestJson: async () => { throw new Error("network"); },
    readInventory: async () => ({ topics: [] }),
    list: async () => [],
    save: async () => { savesAfterFailure += 1; },
  }),
  /network/u,
);
assert.equal(savesAfterFailure, 0);

console.log("product opportunity discovery fixture passed");
