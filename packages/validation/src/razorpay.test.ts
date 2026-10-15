import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { mapRazorpayEvent, verifySignature } from "./razorpay";

describe("verifySignature", () => {
  const raw = '{"event":"payment.captured"}', secret = "whsec";
  const good = createHmac("sha256", secret).update(raw).digest("hex");
  it("accepts a correct signature", () => expect(verifySignature(raw, good, secret)).toBe(true));
  it("rejects wrong, empty and tampered", () => {
    expect(verifySignature(raw, "x".repeat(64), secret)).toBe(false);
    expect(verifySignature(raw, "", secret)).toBe(false);
    expect(verifySignature(raw + " ", good, secret)).toBe(false);
  });
});
describe("mapRazorpayEvent", () => {
  const pay = { id: "pay_1", order_id: "order_1", amount: 12300 };
  it("maps captured/failed", () => {
    expect(mapRazorpayEvent({ event: "payment.captured", payload: { payment: { entity: pay } } })).toMatchObject({ kind: "payment", status: "paid", amount: 12300, razorpayOrderId: "order_1" });
    expect(mapRazorpayEvent({ event: "payment.failed", payload: { payment: { entity: pay } } })).toMatchObject({ status: "failed" });
  });
  it("maps refund.processed", () => expect(mapRazorpayEvent({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 500 } } } })).toMatchObject({ kind: "refund", refundId: "rfnd_1", amount: 500 }));
  it("ignores unknown or malformed events", () => {
    expect(mapRazorpayEvent({ event: "payment.authorized", payload: { payment: { entity: pay } } })).toBeNull();
    expect(mapRazorpayEvent({ event: "payment.captured", payload: {} })).toBeNull();
    expect(mapRazorpayEvent(null)).toBeNull();
  });
});
