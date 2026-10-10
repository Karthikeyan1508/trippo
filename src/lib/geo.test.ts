import assert from "node:assert/strict"
import test from "node:test"

import { isValidLatLng } from "./geo"

test("accepts geographic coordinates and rejects out-of-range pins", () => {
  assert.equal(isValidLatLng({ lat: 28.6139, lng: 77.209 }), true)
  assert.equal(isValidLatLng({ lat: 91, lng: 77.209 }), false)
  assert.equal(isValidLatLng({ lat: 28.6139, lng: 181 }), false)
})
