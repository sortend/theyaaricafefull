import { z } from "zod";

export const roles = ["customer", "kitchen", "delivery", "owner"] as const;
export type Role = (typeof roles)[number];

export const orderStatuses = ["new","accepted","preparing","ready","out_for_delivery","delivered","completed","rejected","cancelled"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

// Mirrors public.transition_order() in SQL. SQL is authoritative; this is for UI hints/tests.
export const allowedTransitions: Record<Exclude<Role, "customer">, Partial<Record<OrderStatus, OrderStatus[]>>> = {
  kitchen: { new: ["accepted", "rejected"], accepted: ["preparing"], preparing: ["ready"] },
  delivery: { ready: ["out_for_delivery"], out_for_delivery: ["delivered"] },
  owner: {
    new: ["accepted", "rejected", "cancelled"], accepted: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"], ready: ["out_for_delivery", "completed", "cancelled"],
    out_for_delivery: ["delivered", "cancelled"], delivered: ["completed"],
  },
};

// Client sends ONLY ids/quantities. Prices are never accepted from the browser.
export const checkoutSchema = z.object({
  type: z.enum(["delivery", "pickup", "dine_in"]),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
    instructions: z.string().max(300).optional(),
    optionIds: z.array(z.string().uuid()).max(10).optional(),
  })).min(1).max(50),
  address: z.object({ line1: z.string().min(3), city: z.string().min(2), postalCode: z.string().min(3), phone: z.string().min(7) }).optional(),
  notes: z.string().max(500).optional(),
  paymentMethod: z.enum(["online", "cod"]).default("online"),
}).refine((v) => v.type !== "delivery" || !!v.address, { message: "Delivery address required", path: ["address"] });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// Normalised payment event. The provider adapter must map the gateway's payload to this shape AFTER signature verification.
export const paymentEventSchema = z.object({
  eventId: z.string().min(1), orderId: z.string().uuid(), reference: z.string().min(1),
  amountMinor: z.number().int().nonnegative(),
  status: z.enum(["paid", "failed", "refunded", "partially_refunded"]),
});
