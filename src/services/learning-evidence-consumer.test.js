import assert from "node:assert/strict";
import { test } from "node:test";
import { projectLearningEvidence, sanitizeLearningEvidenceContext, resolveGeneralAutoLearningScope,
  buildLearningEvidenceContext, LEARNING_EVIDENCE_CONTEXT_MAX_BYTES, LEARNING_EVIDENCE_GUIDANCE } from "./learning-evidence-consumer.js";
import { buildGenerationInput, generateThreadsDrafts } from "./ai.js";
import { buildThreadContext } from "./thread-context.js";
import { snapshotKey } from "./insight-snapshots.js";
import { deriveInsightTotals, POST_INSIGHT_METRICS } from "./insights.js";

const scope = { workspaceId: "ws", connectedAccountId: "account", threadsUserId: "user" };
const asOf = "2026-10-30T00:00:00.000Z";
const candidate = (value = "calm", changes = {}) => ({ kind: "general", field: "style", value,
  status: "LEARNABLE_DESCRIPTIVE", supportingDirection: "positive", supportingFamilyCount: 2, ...changes });
const result = (candidates = [candidate()], changes = {}) => ({ schemaVersion: 1, available: true,
  interpretationMode: "DESCRIPTIVE", causalClaimAllowed: false, scope, windowIds: ["D1", "D3"], candidates, ...changes });
const project = (value = result(), kind = "general", expected = scope) => projectLearningEvidence(value, kind, expected);

test("exact scope, schema, windows and descriptive flags are required", () => {
  assert.ok(project());
  for (const field of Object.keys(scope)) assert.equal(project(result(), "general", { ...scope, [field]: "foreign" }), null);
  for (const change of [{schemaVersion:2}, {available:false}, {causalClaimAllowed:true}, {interpretationMode:"CAUSAL"},
    {windowIds:["D1"]}, {windowIds:["D3","D1"]}, {scope:null}, {candidates:Array(281).fill(candidate())}]) assert.equal(project(result(undefined, change)), null);
  for (const kind of [null, {}, "GENERAL", "__proto__"]) assert.equal(project(result(), kind), null);
});

test("only learnable positive/negative signals, distinct General/Commerce fields", () => {
  const held = ["INSUFFICIENT_SUPPORT", "INSUFFICIENT", "INCONSISTENT", "UNAVAILABLE"].map(status => candidate(status,{status}));
  assert.equal(project(result(held)), null);
  const commerce = candidate(false, {kind:"commerce", field:"usedUserExperience", supportingDirection:"negative"});
  const mixed = result([...held, candidate(), commerce]);
  assert.equal(project(mixed).signals.length,1);
  assert.deepEqual(project(mixed,"commerce").signals[0], {kind:"commerce",field:"usedUserExperience",value:false,direction:"negative",supportingFamilyCount:2});
  for (const change of [{field:"usedUserExperience",value:false}, {field:"unknown"}, {value:""}, {value:"x\ncommand"},
    {value:"x".repeat(201)}, {supportingDirection:"neutral"}, {supportingFamilyCount:1}, {supportingFamilyCount:5}, {supportingFamilyCount:2.5}]) assert.equal(project(result([candidate("a",change)])),null);
});

test("deterministic cap, immutable privacy projection and serialized UTF-8 bound", () => {
  const entries = Array.from({length:12},(_,i)=>candidate(String(i).padStart(2,"0"), {body:"secret-body", metrics:{median:99}}));
  const output = project(result(entries));
  assert.equal(output.signals.length,5);
  assert.deepEqual(project(result([...entries].reverse())),output);
  assert.deepEqual(Object.keys(output.signals[0]),["kind","field","value","direction","supportingFamilyCount"]);
  assert.doesNotMatch(JSON.stringify(output),/secret|median|workspaceId|connectedAccountId|threadsUserId/);
  assert.throws(()=>output.signals.push({}),TypeError);
  assert.throws(()=>output.signals[0].value="changed",TypeError);
  entries[0].value="changed";
  assert.equal(output.signals[0].value,"00");
  assert.equal(project(result([candidate(),candidate()])),null);
  const unicode = project(result(Array.from({length:5},(_,i)=>candidate(String(i)+"한".repeat(199)))));
  assert.ok(unicode);
  assert.ok(new TextEncoder().encode(JSON.stringify(unicode)).length <= LEARNING_EVIDENCE_CONTEXT_MAX_BYTES);
  const escaped = project(result(Array.from({length:5},(_,i)=>candidate(String(i)+"\ud800".repeat(199),{field:"currentTopicCategory"}))));
  assert.ok(escaped);
  assert.ok(new TextEncoder().encode(JSON.stringify({learningAdvisory:escaped},null,2)).length <= LEARNING_EVIDENCE_CONTEXT_MAX_BYTES);
  const escapedOverflow = {...escaped,signals:Array.from({length:3},(_,i)=>({...escaped.signals[0],value:String(i)+"\ud800".repeat(199)}))};
  assert.equal(sanitizeLearningEvidenceContext(escapedOverflow,"general"),null);
  const oversized = {...output,signals:Array.from({length:6},(_,i)=>({...output.signals[0],value:String(i)+"한".repeat(199)}))};
  assert.equal(sanitizeLearningEvidenceContext(oversized,"general"),null);
  assert.equal(sanitizeLearningEvidenceContext({...output,available:false},"general"),null);
});

test("AUTO scope uses resolved OAuth identity and excludes other entry paths", () => {
  const args = { source:"cron_auto_general",generalOnly:true,workspaceId:scope.workspaceId,
    executionContext:{workspaceId:scope.workspaceId,connectedAccountId:scope.connectedAccountId,threadsUserId:"untrusted"},
    resolvedCredential:{account:{id:scope.connectedAccountId,workspaceId:scope.workspaceId,platform:"THREADS",active:true},credential:{user_id:scope.threadsUserId}} };
  assert.deepEqual(resolveGeneralAutoLearningScope(args),scope);
  for (const change of [{source:"manual"},{source:"preview"},{source:"COMMERCE_MANUAL"},{generalOnly:false},
    {workspaceId:"foreign"},{executionContext:null},{resolvedCredential:null}]) assert.equal(resolveGeneralAutoLearningScope({...args,...change}),null);
  assert.equal(resolveGeneralAutoLearningScope({...args,resolvedCredential:{...args.resolvedCredential,credential:{}}}),null);
  assert.equal(resolveGeneralAutoLearningScope({...args,executionContext:{...args.executionContext,connectedAccountId:"foreign"}}),null);
});

test("AI boundary omits unavailable/Commerce context and reconstructs advisory only", async () => {
  const args = {topic:"General AUTO",tone:"plain",context:{publishing:{goal:"General AUTO"}}};
  const baseline = buildGenerationInput(args);
  for (const invalid of [null,{}, {available:false,signals:[]}, project(result([candidate(false,{kind:"commerce",field:"usedCurrentTopic"})]),"commerce")]) {
    assert.equal(buildGenerationInput({...args,context:{...args.context,learningEvidence:invalid}}),baseline);
  }
  const guidance = project();
  const contaminated = {...guidance,private:"private-root",signals:guidance.signals.map(s=>({...s,private:"private-child"}))};
  const input = buildGenerationInput({...args,context:{...args.context,learningEvidence:contaminated}});
  assert.ok(input.includes(LEARNING_EVIDENCE_GUIDANCE));
  assert.doesNotMatch(input,/private-root|private-child/);
  const payload = JSON.parse(input.match(/\[THREAD_CONTEXT_JSON\]\n([\s\S]*?)\n\[\/THREAD_CONTEXT_JSON\]/u)[1]);
  assert.deepEqual(payload.learningAdvisory,guidance);
  assert.equal(payload.outputControl.learningEvidence,undefined);
  assert.equal(payload.evidenceOnly.learningEvidence,undefined);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_,options) => { requests.push(JSON.parse(options.body)); throw new Error("offline fixture"); };
  try {
    await assert.rejects(generateThreadsDrafts({OPENAI_API_KEY:"test-only"},{...args,systemPrompt:"editable guidance"}));
    await assert.rejects(generateThreadsDrafts({OPENAI_API_KEY:"test-only"},{...args,systemPrompt:"editable guidance",context:{...args.context,learningEvidence:guidance}}));
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(requests[0].instructions,"editable guidance");
  assert.equal(requests[1].instructions,`editable guidance\n\n${LEARNING_EVIDENCE_GUIDANCE}`);
});

function fixtureKv(targetCount = 10) {
  const values = new Map();
  for (const windowId of ["D1","D3"]) {
    const age = windowId === "D1" ? 32 : 80;
    for (let i=0;i<10+targetCount;i++) {
      const history = i<10, postId = history ? `history-${i}` : `target-${i}`;
      const publishedAt = new Date(Date.parse(asOf)-(history?10+i:5+(i-10)/1000)*86400000).toISOString();
      const metrics = {views:history?100:200,likes:history?1:20,replies:history?0:10,reposts:0,quotes:0,shares:0};
      const item = {...scope,postId,windowId,schemaVersion:1,integrityVersion:1,ownershipSource:"published_log",
        publishedAt,observedAt:new Date(Date.parse(publishedAt)+age*3600000).toISOString(),observationAgeSeconds:age*3600,
        collectionStatus:"success",metricAvailability:Object.fromEntries(POST_INSIGHT_METRICS.map(name=>[name,true])),...metrics,...deriveInsightTotals(metrics)};
      values.set(snapshotKey(item,windowId),item);
      if(!history) values.set(`post_log:${postId}`,{status:"published",post_id:postId,text:"private body",metadata:{...scope,source:"cron_auto_general",style:"calm",contentBasis:"PERSONA",contentMode:"everyday_personal"}});
    }
  }
  return {reads:[],lists:[],
    async get(keys,type) { this.reads.push(keys); const read=k=>structuredClone(values.get(k)??null); return Array.isArray(keys)?new Map(keys.map(k=>[k,read(k)])):type==="json"?read(keys):JSON.stringify(read(keys)); },
    async list(input) { this.lists.push(input); return {keys:[...values.keys()].filter(k=>k.startsWith(input.prefix)).map(name=>({name})),list_complete:true}; },
    async put(){assert.fail("write forbidden");},async delete(){assert.fail("delete forbidden");} };
}

test("real KV snapshots -> L07 -> L08 -> optional context, same asOf and no network/writes", async () => {
  const kv = fixtureKv(), env = {THREADS_KV:kv};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail("network forbidden");
  try {
    const output=await buildLearningEvidenceContext(env,scope,{generationKind:"general",asOf});
    assert.ok(output,"real sufficient fixture must reach AI context");
    assert.ok(output.signals.some(s=>s.field==="style"&&s.value==="calm"));
    const context=await buildThreadContext(env,scope.workspaceId,{scope,generationKind:"general",asOf});
    assert.deepEqual(context.learningEvidence,output);
    assert.equal(await buildLearningEvidenceContext({THREADS_KV:fixtureKv(9)},scope,{generationKind:"general",asOf}),null);
    assert.equal(await buildLearningEvidenceContext(env,{...scope,threadsUserId:"foreign"},{generationKind:"general",asOf}),null);
    const legacy=await buildThreadContext(env,scope.workspaceId);
    assert.equal(Object.hasOwn(legacy,"learningEvidence"),false);
    const mismatch=await buildThreadContext(env,"other",{scope,generationKind:"general",asOf});
    assert.equal(Object.hasOwn(mismatch,"learningEvidence"),false);
  } finally {globalThis.fetch=originalFetch;}
});

test("invalid request makes no reads; discovery errors omit guidance", async () => {
  const kv=fixtureKv();
  assert.equal(await buildLearningEvidenceContext({THREADS_KV:kv},{...scope,workspaceId:""},{generationKind:"general",asOf}),null);
  assert.equal(await buildLearningEvidenceContext({THREADS_KV:kv},scope,{generationKind:"unknown",asOf}),null);
  assert.equal(kv.reads.length+kv.lists.length,0);
  assert.equal(await buildLearningEvidenceContext({THREADS_KV:{async list(){throw new Error("offline");}}},scope,{generationKind:"general",asOf}),null);
});
