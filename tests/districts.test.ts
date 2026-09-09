import { test } from "node:test";
import assert from "node:assert/strict";
import { DISTRICTS, DISTRICT_PURPOSES } from "../shared/map.ts";

test("atlas purposes match Claude/Heavy accepted district verbs, one per catalog district", () => {
  assert.equal(DISTRICTS.length, 6);
  assert.equal(Object.keys(DISTRICT_PURPOSES).length, DISTRICTS.length);
  for (const d of DISTRICTS) {
    const purpose = DISTRICT_PURPOSES[d.id];
    assert.ok(purpose.length > 12 && purpose.length < 120, d.id);
  }
  assert.match(DISTRICT_PURPOSES.town, /Assign pals/);
  assert.match(DISTRICT_PURPOSES.comms, /verified connected/);
  assert.match(DISTRICT_PURPOSES.forge, /Where code lands/);
  assert.match(DISTRICT_PURPOSES.infra, /Where things run/);
  assert.match(DISTRICT_PURPOSES.research, /open questions/);
  assert.match(DISTRICT_PURPOSES.commons, /signed skills/);
});
