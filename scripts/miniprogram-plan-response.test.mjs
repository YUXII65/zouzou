import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("planInbox 自动解开服务端 plan 包装", async () => {
  globalThis.wx = {
    getStorageSync() { return "test-token"; },
    request(options) {
      options.success({
        statusCode: 200,
        data: {
          plan: {
            source: "model",
            action: "single_task",
            tasks: [{ title: "直接开始" }],
          },
        },
      });
    },
  };

  const { planInbox } = require("../miniprogram/utils/api.js");
  const plan = await planInbox({ itemId: "inbox-1" });
  assert.equal(plan.source, "model");
  assert.equal(plan.tasks.length, 1);
});
