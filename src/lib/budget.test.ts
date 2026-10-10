import assert from "node:assert/strict"
import test from "node:test"

import { convertAtRate } from "./budget"

test("converts an expense to cents without rounding drift", () => {
  assert.equal(convertAtRate(1200, 2.333333), 2800)
})
