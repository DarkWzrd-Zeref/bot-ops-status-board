import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHAT_DRAFT_KEY,
  QUICK_DRAFT_KEY,
  composerAfterAttempt,
  persistComposerDrafts,
  readDraft,
  snapshotDrafts,
} from "../src/ui/drafts.ts";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  readonly ops: Array<[string, string, string?]> = [];
  private readonly store: Map<string, string>;
  private readonly fail: boolean;
  constructor(store = new Map<string, string>(), fail = false) {
    this.store = store;
    this.fail = fail;
  }
  getItem(key: string) {
    this.ops.push(["get", key]);
    if (this.fail) throw new Error("storage blocked");
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.ops.push(["set", key, value]);
    if (this.fail) throw new Error("quota");
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.ops.push(["remove", key]);
    if (this.fail) throw new Error("storage blocked");
    this.store.delete(key);
  }
}

test("composer keeps text on failed send and while the user keeps typing", () => {
  assert.equal(composerAfterAttempt("hello crew", "hello crew", false), "hello crew");
  assert.equal(composerAfterAttempt("hello crew", "hello crew", true), "");
  assert.equal(composerAfterAttempt("hello crew — wait", "hello crew", true), "hello crew — wait");
});

test("persistComposerDrafts writes both composers and clearing one does not drop the other", () => {
  const storage = new MemoryStorage();
  persistComposerDrafts("radio draft", "quick draft", storage);
  assert.deepEqual(snapshotDrafts(storage), {
    [CHAT_DRAFT_KEY]: "radio draft",
    [QUICK_DRAFT_KEY]: "quick draft",
  });
  persistComposerDrafts("", "quick draft", storage);
  assert.equal(readDraft(CHAT_DRAFT_KEY, storage), "");
  assert.equal(readDraft(QUICK_DRAFT_KEY, storage), "quick draft");
  assert.ok(storage.ops.some(op => op[0] === "remove" && op[1] === CHAT_DRAFT_KEY));
});

test("disabled sessionStorage does not throw and in-memory composer text still survives", () => {
  const storage = new MemoryStorage(new Map(), true);
  assert.doesNotThrow(() => persistComposerDrafts("still typing", "quick still here", storage));
  assert.equal(readDraft(CHAT_DRAFT_KEY, storage), "");
  assert.equal(composerAfterAttempt("still typing", "still typing", false), "still typing");
});

test("HUD flushes composers before reconnect/update and uses composerAfterAttempt on send", () => {
  const hud = readFileSync(new URL("../src/ui/hud.ts", import.meta.url), "utf8");
  assert.match(hud, /persistComposerDrafts\(draft, host\.querySelector<HTMLInputElement>\("#quick-text"\)\?\.value \?\? ""\)/);
  assert.match(hud, /if \(b\.id === "hub-reconnect"\) \{ persistComposerDrafts/);
  assert.match(hud, /if \(b\.id === "hub-update"\) \{ persistComposerDrafts/);
  assert.match(hud, /draft = composerAfterAttempt\(draft, submitted, true\)/);
  assert.match(hud, /draft = composerAfterAttempt\(draft, submitted, false\)/);
  const release = readFileSync(new URL("../src/ui/release.ts", import.meta.url), "utf8");
  assert.doesNotMatch(release, /saveDraft\(|storage\.removeItem/);
});
