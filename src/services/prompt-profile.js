import { THREADS_ANALYTICS_PROMPT, THREADS_CONTENT_PROMPT, THREADS_IDENTITY_PROMPT, THREADS_POLICY_PROMPT, THREADS_PRODUCT_PROMPT, composeThreadsSystemPrompt } from "../prompts/threads/index.js";
import { getJson, putJson } from "./kv.js";

const KEY = "operator_prompt_profile:v1";
const FIELDS = ["identityWriting", "generalWritingPolicy", "contentAndFormatPreferences", "productWritingGuidance", "analyticsWritingGuidance"];
const MAX_LENGTH = 30000;
export function getDefaultPromptProfile() { return { identityWriting: THREADS_IDENTITY_PROMPT, generalWritingPolicy: THREADS_POLICY_PROMPT, contentAndFormatPreferences: THREADS_CONTENT_PROMPT, productWritingGuidance: THREADS_PRODUCT_PROMPT, analyticsWritingGuidance: THREADS_ANALYTICS_PROMPT }; }
function normalizePatch(value) { if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length || Object.keys(value).some((key) => !FIELDS.includes(key))) throw new Error("Invalid prompt profile"); const patch={}; for(const key of Object.keys(value)){if(typeof value[key]!=="string"||value[key].trim().length>MAX_LENGTH) throw new Error("Invalid prompt profile value");patch[key]=value[key].trim();} return patch; }
export async function getStoredPromptProfile(env) { const stored=await getJson(env,KEY); if(!stored||stored.version!==1||!stored.profile||typeof stored.profile!=="object"||Array.isArray(stored.profile))return { profile:{},updatedAt:null }; const profile={}; for(const key of FIELDS) if(typeof stored.profile[key]==="string"&&stored.profile[key].trim().length<=MAX_LENGTH)profile[key]=stored.profile[key].trim(); return {profile,updatedAt:typeof stored.updatedAt==="string"?stored.updatedAt:null}; }
export async function getEffectivePromptProfile(env) { const stored=await getStoredPromptProfile(env); return { profile:{...getDefaultPromptProfile(),...stored.profile},updatedAt:stored.updatedAt}; }
export async function updatePromptProfile(env, patch) { const normalized=normalizePatch(patch); const current=await getStoredPromptProfile(env); const updatedAt=new Date().toISOString(); await putJson(env,KEY,{version:1,updatedAt,profile:{...current.profile,...normalized}}); return getEffectivePromptProfile(env); }
export async function resetPromptProfile(env) { if(!env?.THREADS_KV||typeof env.THREADS_KV.delete!=="function") throw new Error("Prompt profile storage is unavailable"); await env.THREADS_KV.delete(KEY); return {profile:getDefaultPromptProfile(),updatedAt:null}; }
export function composeEffectiveThreadsPrompt(profile) { return composeThreadsSystemPrompt(profile); }
