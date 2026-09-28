import assert from "node:assert/strict";
import test from "node:test";
import { mayRead } from "./document_policy.ts";

test("a volunteer question never exposes a donor receipt", () => {
  assert.equal(mayRead("volunteer", "receipt"), false);
  assert.equal(mayRead("volunteer", "reminder"), true);
  assert.equal(mayRead("campaign", "receipt"), false);
  assert.equal(mayRead("finance", "receipt"), true);
});
