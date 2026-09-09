import assert from "node:assert/strict";
import { matchProductOpportunityAssets } from "./product-opportunity-asset-matcher.js";

const opportunity = { productName: "Coffee Grinder", brand: "BrewCo", category: "coffee", problem: "Morning coffee takes too much counter space", audience: "office workers", situation: "quick commute morning coffee", angle: "small practical upgrade", discoveryReason: "signal" };
function media(id, overrides = {}) { return { id, sourceType: "product", active: true, mediaKind: "image", description: "Compact BrewCo coffee grinder for quick morning coffee", tags: ["coffee", "commute"], experienceTags: ["morning", "coffee"], experienceNote: "I used this during rushed weekday coffee preparation.", sceneType: "kitchen", usableAngles: ["small practical upgrade"], ...overrides }; }
const strong = media("strong");
const weak = media("weak", { description: "Blue storage box", tags: ["storage"], experienceTags: [], experienceNote: "I organized a drawer.", sceneType: null, usableAngles: [] });
const results = matchProductOpportunityAssets(opportunity, [weak, strong]);
assert.equal(results[0].mediaId, "strong");
assert.equal(results[0].hasUserExperience, true);
assert.equal(results[0].reasons.includes("관련 USER_EXPERIENCE 존재"), true);
assert.equal(results.some((item) => item.mediaId === "weak"), false);
const tagOnly = matchProductOpportunityAssets(opportunity, [media("tag-only", { experienceNote: "", experienceTags: ["coffee", "morning"] })])[0];
assert.equal(tagOnly.hasUserExperience, false);
const unrelatedNote = matchProductOpportunityAssets(opportunity, [media("unrelated", { description: "Coffee grinder", tags: ["coffee"], experienceNote: "I watched a movie at home.", experienceTags: [] })])[0];
assert.equal(unrelatedNote.hasUserExperience, true);
assert.equal(unrelatedNote.reasons.includes("관련 USER_EXPERIENCE 존재"), false);
assert.equal(matchProductOpportunityAssets(opportunity, [media("inactive", { active: false }), media("general", { sourceType: "general" })]).length, 0);
assert.equal(matchProductOpportunityAssets(opportunity, []).length, 0);
assert.equal(matchProductOpportunityAssets({ ...opportunity, productName: "커피그라인더", problem: "출근 전 커피 준비" }, [media("korean", { description: "커피 그라인더 출근전 준비", tags: ["커피"] })])[0].mediaId, "korean");
assert.equal(matchProductOpportunityAssets({ ...opportunity, productName: "COFFEE-GRINDER" }, [media("english", { description: "coffee grinder" })])[0].mediaId, "english");
assert.equal(matchProductOpportunityAssets(opportunity, Array.from({ length: 7 }, (_, index) => media(`id-${index}`))).length, 5);
console.log("product opportunity asset matcher fixture passed");
