import { test } from "node:test";
import assert from "node:assert/strict";
import { compose } from "../lib/composer/index.ts";
import { CATEGORIES, TONES, OCCASIONS } from "../lib/catalog.ts";

test("composes for every category/tone/intensity", () => {
  for (const category of CATEGORIES)
    for (const tone of TONES)
      for (const intensity of [1, 2, 3] as const) {
        const h = compose({ category, tone, intensity, seed: 42 });
        assert.ok(h.paragraphs.length >= 3);
        assert.ok(!h.paragraphs.join(" ").includes("{"), "no unfilled placeholders");
      }
});

test("is deterministic per seed and varies across seeds", () => {
  const a = compose({ category: "roast", tone: "deadpan", intensity: 2, seed: 7 });
  const b = compose({ category: "roast", tone: "deadpan", intensity: 2, seed: 7 });
  assert.deepEqual(a, b);
  const texts = new Set(
    Array.from({ length: 20 }, (_, s) => compose({ category: "roast", tone: "deadpan", intensity: 2, seed: s }).paragraphs.join()),
  );
  assert.ok(texts.size > 12, `expected variety, got ${texts.size}`);
});

test("uses name, interests and occasion", () => {
  for (const occasion of OCCASIONS) {
    const h = compose({ category: "flirt", tone: "playful", intensity: 3, name: "Maya", interests: ["pickleball"], occasion, seed: 3 });
    const t = h.paragraphs.join(" ");
    assert.match(h.headline, /Maya/);
    assert.match(t, /pickleball/);
  }
});

test("avoid list steers away from seen lines", () => {
  const first = compose({ category: "encourage", tone: "heartfelt", intensity: 2, seed: 11 });
  let overlap = 0;
  for (let s = 0; s < 30; s++) {
    const next = compose({ category: "encourage", tone: "heartfelt", intensity: 2, seed: s, avoid: first.lineIds });
    overlap += next.lineIds.filter((id) => first.lineIds.includes(id)).length;
  }
  assert.ok(overlap < 15, `overlap ${overlap}`);
});

test("strips markup from names", () => {
  const h = compose({ category: "laugh", tone: "playful", intensity: 1, name: "<script>Bo</script>", seed: 1 });
  assert.ok(!h.headline.includes("<"));
});
