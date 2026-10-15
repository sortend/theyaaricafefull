import { createHmac, timingSafeEqual } from "crypto";

/** Razorpay signs the RAW webhook body with HMAC-SHA256 (hex) using the webhook secret. */
export function verifySignature(raw: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type Mapped =
  | { kind: "payment"; razorpayOrderId: string; paymentId: string; amount: number; status: "paid" | "failed" }
  | { kind: "refund"; paymentId: string; refundId: string; amount: number }
  | null;

export function mapRazorpayEvent(ev: any): Mapped {
  const pay = ev?.payload?.payment?.entity;
  if ((ev?.event === "payment.captured" || ev?.event === "payment.failed") && pay?.order_id && pay?.id && Number.isInteger(pay?.amount))
    return { kind: "payment", razorpayOrderId: pay.order_id, paymentId: pay.id, amount: pay.amount, status: ev.event === "payment.captured" ? "paid" : "failed" };
  if (ev?.event === "refund.processed") {
    const r = ev?.payload?.refund?.entity;
    if (r?.id && r?.payment_id && Number.isInteger(r?.amount)) return { kind: "refund", paymentId: r.payment_id, refundId: r.id, amount: r.amount };
  }
  return null; // everything else (e.g. payment.authorized) is ignored on purpose
}
