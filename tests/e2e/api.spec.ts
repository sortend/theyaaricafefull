import { expect, test } from "@playwright/test";
const id = "7d5a9d3e-3f1a-4a52-9a53-0c5b2f1e8a11";

test("public pages render", async ({ request }) => {
  for (const p of ["/", "/faq", "/privacy", "/terms", "/about", "/contact", "/order/failed", "/login"]) expect((await request.get(p)).status(), p).toBe(200);
  expect(await (await request.get("/")).text()).toContain("Yaari");
});
test("unknown item id is a 404", async ({ request }) => expect((await request.get("/menu/not-an-id")).status()).toBe(404));
test("checkout rejects malformed input", async ({ request }) => expect((await request.post("/api/checkout", { data: { type: "pickup", items: [] } })).status()).toBe(400));
test("checkout requires sign-in", async ({ request }) => expect((await request.post("/api/checkout", { data: { type: "pickup", items: [{ menuItemId: id, quantity: 1 }] } })).status()).toBe(401));
test("payment webhook rejects missing and bad signatures", async ({ request }) => {
  expect((await request.post("/api/webhooks/payment", { data: { a: 1 } })).status()).toBe(401);
  expect((await request.post("/api/webhooks/payment", { data: { a: 1 }, headers: { "x-signature": "bad" } })).status()).toBe(401);
});
test("notify endpoint rejects a wrong secret", async ({ request }) => expect((await request.post("/api/notify", { data: {}, headers: { "x-notify-secret": "nope" } })).status()).toBe(401));
