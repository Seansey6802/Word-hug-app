import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VIDEO_CAPACITY, PRODUCTS, VIDEO_PRICE_CENTS, WRITTEN_PRICE_CENTS, formatPrice, product } from "../../lib/commerce/products.ts";

test("founder video is $15", () => {
  assert.equal(VIDEO_PRICE_CENTS, 1500);
  assert.equal(formatPrice(VIDEO_PRICE_CENTS), "$15");
});

test("written hug is $1", () => {
  assert.equal(WRITTEN_PRICE_CENTS, 100);
});

test("initial capacity is five videos per recording day", () => {
  assert.equal(DEFAULT_VIDEO_CAPACITY, 5);
});

test("no bundle still contains a video", () => {
  for (const p of PRODUCTS.filter((x) => x.kind === "bundle")) {
    assert.ok(!p.credits?.video, `${p.sku} still includes a video`);
  }
  assert.equal(product("bundle_big_squeeze"), undefined);
});

test("subscriptions stay deferred and unavailable", () => {
  for (const p of PRODUCTS.filter((x) => x.kind === "subscription")) {
    assert.equal(p.available, false);
    assert.equal(p.deferred, true);
  }
});

test("nothing is wired to a real Stripe price yet", () => {
  for (const p of PRODUCTS) assert.equal(p.stripePriceId, undefined);
});

test("payments refuse live keys and unknown modes", async () => {
  const { assertTestKey, paymentsMode } = await import("../../lib/payments/gateway.ts");
  assert.throws(() => assertTestKey("sk_live_123"), /non-test/);
  assert.throws(() => assertTestKey("rk_live_123"), /non-test/);
  assert.throws(() => assertTestKey(undefined), /not set/);
  assert.equal(assertTestKey("sk_test_abc"), "sk_test_abc");
  const old = process.env.PAYMENTS_MODE;
  process.env.PAYMENTS_MODE = "live";
  assert.throws(() => paymentsMode(), /Live payments are not enabled/);
  process.env.PAYMENTS_MODE = "demo";
  assert.throws(() => paymentsMode());
  process.env.PAYMENTS_MODE = old;
});

test("bundles stay deferred, hidden and unavailable", () => {
  for (const p of PRODUCTS.filter((x) => x.kind === "bundle")) {
    assert.equal(p.available, false);
    assert.equal(p.deferred, true);
  }
});
