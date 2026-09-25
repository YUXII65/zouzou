import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ENTRY_PATH,
  guestEntryPath,
  newUserEntryPath,
} from "@/lib/entry-policy";

test("关闭首次引导时新用户直接进入主界面", () => {
  assert.equal(newUserEntryPath("/welcome?signup=register", false), DEFAULT_ENTRY_PATH);
  assert.equal(newUserEntryPath("/custom", false), "/custom");
  assert.equal(guestEntryPath(false), DEFAULT_ENTRY_PATH);
});

test("重新开启首次引导时仍回到欢迎页", () => {
  assert.equal(newUserEntryPath("/", true), "/welcome?signup=register");
  assert.equal(guestEntryPath(true), "/welcome?guest=1&signup=guest");
});
