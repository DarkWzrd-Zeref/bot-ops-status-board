import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readUsage, recordMemory, searchMemory, boosterCapabilities } from "../server/boosters.ts";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "area67-boosters-"));
process.env.AREA67_TEST = "1"; process.env.SERVE_STATIC = "0";
const { app } = await import("../server/index.ts");
const keys = { codex: "codex-test-" + "c".repeat(32), zeref: "zeref-test-" + "z".repeat(32) };
process.env.AREA67_ECOSYSTEM_KEYS = JSON.stringify(keys);
const envKeys = ["HUB_QUOTA_URL","HUB_QUOTA_TOKEN","HUB_JUDGMENT_URL","HUB_JUDGMENT_TOKEN"];
envKeys.forEach(key => delete process.env[key]);
const now = new Date().toISOString();
const usage = { schemaVersion:1, checkedAt:now, coverage:"configured-accounts-only", refresh:"Submit a new source reading.",
  accounts:[{provider:"codex",accountId:"primary",source:"product-connector",observedAt:now,status:"reported",unavailableReason:null,
    windows:[{id:"weekly",label:"Weekly",usedPercent:37.5,remainingPercent:62.5,windowMinutes:10080,resetsAt:null,status:"reported",precision:"as-reported-by-source"}]}],
  unconfiguredProviders:["chatgpt","claude","cursor","grok"] };
const entry = { id:"memory-1",kind:"decision",seat:"codex",title:"Keep source timestamps",body:"No fabricated readings",tags:[],at:now,attribution:"operator-reported" };
let rpcId = 0;
async function call(name: string, args: object = {}, token?: string) {
  const response = await app.request("/mcp/codex",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream",
    ...(token ? {Authorization:"Bearer "+token} : {})},body:JSON.stringify({jsonrpc:"2.0",id:++rpcId,method:"tools/call",params:{name,arguments:args}})});
  const raw = await response.text();
  return JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find(s=>s.startsWith("data: "))!.slice(6)).result;
}
function configure() {
  process.env.HUB_QUOTA_URL="https://quota.example";
  process.env.HUB_QUOTA_TOKEN="quota-service-secret-"+"q".repeat(32);
  process.env.HUB_JUDGMENT_URL="https://memory.example";
  process.env.HUB_JUDGMENT_TOKEN="memory-service-secret-"+"m".repeat(32);
}
await test("baseline discovery is public and does not claim unconfigured sources are usable", async () => {
  const body = await (await app.request("/api/boosters")).json();
  assert.equal(body.skills.length,2);
  assert.ok(body.skills.every((s: {state:string})=>s.state==="unconfigured"));
  assert.equal((await readUsage()).state,"unconfigured");
  const rpc = await call("booster_capabilities");
  assert.equal(JSON.parse(rpc.content[0].text).skills.length,2);
});
await test("private REST and MCP operations require the correct existing seat key before fetching", async () => {
  const original=globalThis.fetch; let calls=0;
  globalThis.fetch=(async()=>{calls++;throw Error("Should not fetch");}) as typeof fetch;
  try {
    for(const route of ["/api/boosters/usage","/api/boosters/memory"]) {
      const denied=await app.request(route);
      assert.equal(denied.status,403);
      assert.equal(denied.headers.get("cache-control"),"no-store");
      assert.equal((await app.request(route,{headers:{Authorization:"Bearer "+keys.codex}})).status,403);
    }
    assert.equal((await call("usage_read")).isError,true);
    assert.equal((await call("memory_search",{query:"x"},keys.zeref)).isError,true);
    assert.equal((await call("memory_record",{title:"x"},keys.zeref)).isError,true);
    assert.equal(calls,0);
  } finally {globalThis.fetch=original;}
});
await test("usage reads preserve exact source values and coverage while stripping unknown fields", async () => {
  configure();
  const result=await readUsage((async (input,init)=>{
    assert.equal(String(input),"https://quota.example/api/usage");
    assert.equal(init?.redirect,"error");
    assert.equal(new Headers(init?.headers).get("authorization"),"Bearer "+process.env.HUB_QUOTA_TOKEN);
    return new Response(JSON.stringify({...usage,upstreamToken:"must-not-escape"}));
  }) as typeof fetch);
  assert.equal(result.state,"ready");
  if(result.state==="ready") {
    assert.equal(result.data.accounts[0].windows[0].remainingPercent,62.5);
    assert.equal(result.data.unconfiguredProviders.length,4);
    assert.doesNotMatch(JSON.stringify(result),/must-not-escape/);
  }
});
await test("malformed, inconsistent, oversized and failing upstream responses are sanitized", async () => {
  configure();
  for(const response of [
    new Response("private-error-and-secret",{status:500}),
    new Response("not JSON"),
    new Response(JSON.stringify({...usage,accounts:[{...usage.accounts[0],windows:[{...usage.accounts[0].windows[0],remainingPercent:100}]}]})),
    new Response("x".repeat(262145)),
  ]) {
    const result=await readUsage((async()=>response) as typeof fetch);
    assert.equal(result.state,"unavailable");
    assert.doesNotMatch(JSON.stringify(result),/private-error|service-secret|quota.example/);
  }
  const aborting=(async(_input,init)=>new Promise((_resolve,reject)=>{
    init?.signal?.addEventListener("abort",()=>reject(new Error("private timeout")));
  })) as typeof fetch;
  assert.equal((await readUsage(aborting)).state,"unavailable");
});
await test("unsafe URL configuration never sends the service token", async () => {
  for(const url of ["http://external.example","https://user:secret@external.example","https://external.example?token=x","https://external.example/path"]) {
    process.env.HUB_QUOTA_URL=url;
    assert.equal((await readUsage((async()=>{throw Error("Must not fetch");}) as typeof fetch)).state,"unconfigured");
  }
  configure(); assert.ok(boosterCapabilities().every(s=>s.state==="configured"));
});
await test("memory record fixes attribution to the authenticated caller and protects query encoding", async () => {
  configure();
  const recorded=await recordMemory("codex",{kind:"decision",title:entry.title,body:entry.body},(async(_input,init)=>{
    const sent=JSON.parse(String(init?.body)); assert.equal(sent.seat,"codex");
    return new Response(JSON.stringify(entry));
  }) as typeof fetch);
  assert.equal(recorded.state,"ready");
  assert.throws(()=>recordMemory("codex",{title:"x",seat:"claude"}));
  const read=await searchMemory("one & two",(async(input)=>{
    assert.equal(String(input),"https://memory.example/api/entries?q=one%20%26%20two");
    return new Response(JSON.stringify({entries:[entry],total:1,retrieval:"keyword"}));
  }) as typeof fetch);
  assert.equal(read.state,"ready");
});
await test("authenticated MCP and operator REST can query the baseline using server-side credentials", async () => {
  configure(); const original=globalThis.fetch;
  globalThis.fetch=(async()=>new Response(JSON.stringify(usage))) as typeof fetch;
  try {
    const rpc=await call("usage_read",{},keys.codex);
    assert.equal(JSON.parse(rpc.content[0].text).state,"ready");
    const response=await app.request("/api/boosters/usage",{headers:{Authorization:"Bearer "+keys.zeref}});
    assert.equal((await response.json()).data.accounts[0].windows[0].usedPercent,37.5);
    assert.equal(response.headers.get("cache-control"),"no-store");
  } finally {globalThis.fetch=original;}
});
