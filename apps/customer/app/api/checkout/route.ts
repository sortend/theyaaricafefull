import { cookies } from "next/headers";
import { serverClient } from "@yaari/database";
import { checkoutSchema } from "@yaari/validation";

export async function POST(req: Request) {
  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const sb = serverClient(cookies());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "Please sign in" }, { status: 401 });
  const { type, items, address, notes, paymentMethod } = parsed.data;
  // Totals are computed inside Postgres (place_order); the browser never supplies prices.
  const { data, error } = await sb.rpc("place_order", { p_type: type, p_items: items, p_address: address ?? null, p_notes: notes ?? null, p_payment_method: paymentMethod });
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ orderId: data }, { status: 201 });
}
