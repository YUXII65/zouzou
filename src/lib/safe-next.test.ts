import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "@/lib/safe-next";

test("safeNext keeps local paths", () => {
  assert.equal(safeNext("/workspace?tab=projects"), "/workspace?tab=projects");
});

test("safeNext rejects protocol-relative and backslash redirects", () => {
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("/\\evil.com"), "/");
  assert.equal(safeNext("/%5c%5cevil.com"), "/");
});

test("safeNext rejects absolute redirects", () => {
  assert.equal(safeNext("https://evil.com"), "/");
});
