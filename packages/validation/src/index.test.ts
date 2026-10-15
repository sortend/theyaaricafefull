import { describe, expect, it } from "vitest";
import { allowedTransitions, checkoutSchema, paymentEventSchema } from "./index";
const id = "7d5a9d3e-3f1a-4a52-9a53-0c5b2f1e8a11";

describe("checkoutSchema", () => {
  it("accepts a valid pickup order", () => expect(checkoutSchema.safeParse({ type: "pickup", items: [{ menuItemId: id, quantity: 2 }] }).success).toBe(true));
  it("rejects delivery without an address", () => expect(checkoutSchema.safeParse({ type: "delivery", items: [{ menuItemId: id, quantity: 1 }] }).success).toBe(false));
  it("rejects zero, negative and huge quantities", () => {
    for (const quantity of [0, -1, 51]) expect(checkoutSchema.safeParse({ type: "pickup", items: [{ menuItemId: id, quantity }] }).success).toBe(false);
  });
  it("rejects empty carts and bad ids", () => {
    expect(checkoutSchema.safeParse({ type: "pickup", items: [] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ type: "pickup", items: [{ menuItemId: "x", quantity: 1 }] }).success).toBe(false);
  });
});
it("rejects malformed option ids", () => expect(checkoutSchema.safeParse({ type: "pickup", items: [{ menuItemId: id, quantity: 1, optionIds: ["nope"] }] }).success).toBe(false));
describe("allowedTransitions", () => {
  it("kitchen cannot deliver or complete", () => {
    expect(allowedTransitions.kitchen.preparing).toEqual(["ready"]);
    expect(allowedTransitions.kitchen.ready).toBeUndefined();
  });
  it("delivery only moves ready -> out_for_delivery -> delivered", () => expect(Object.keys(allowedTransitions.delivery)).toEqual(["ready", "out_for_delivery"]));
});
describe("paymentEventSchema", () => {
  it("rejects unknown statuses", () => expect(paymentEventSchema.safeParse({ eventId: "e", orderId: id, reference: "r", amountMinor: 1, status: "success" }).success).toBe(false));
});
