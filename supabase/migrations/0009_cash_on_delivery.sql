-- Cash on delivery / pay at counter. Cash becomes 'paid' only via record_cash_payment (owner, or the ASSIGNED delivery rider).
alter table orders add column payment_method text not null default 'online' check (payment_method in ('online','cod'));
insert into settings values ('cod_enabled','true') on conflict do nothing;

drop function place_order(order_type, jsonb, jsonb, text);
create function place_order(p_type order_type, p_items jsonb, p_address jsonb, p_notes text, p_payment_method text default 'online')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_sub int := 0; v_tax int; v_fee int := 0; v_id uuid; e jsonb; v_opts uuid[]; v_unit int; v_qty int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_type = 'delivery' and p_address is null then raise exception 'address required'; end if;
  if p_payment_method not in ('online','cod') then raise exception 'invalid payment method'; end if;
  if p_payment_method = 'cod' and not (select (value)::boolean from settings where key = 'cod_enabled') then raise exception 'cash payment is not available'; end if;
  for e in select * from jsonb_array_elements(p_items) loop
    v_qty := (e->>'quantity')::int; if v_qty < 1 or v_qty > 50 then raise exception 'invalid quantity'; end if;
    v_opts := array(select x::uuid from jsonb_array_elements_text(e->'optionIds') x);
    v_sub := v_sub + item_unit_price((e->>'menuItemId')::uuid, v_opts) * v_qty;
  end loop;
  v_tax := round(v_sub * (select (value)::int from settings where key='tax_bps') / 10000.0);
  if p_type = 'delivery' then v_fee := (select (value)::int from settings where key='delivery_fee_minor'); end if;
  insert into orders(customer_id,type,subtotal_minor,tax_minor,delivery_fee_minor,total_minor,address,notes,payment_method)
    values (v_uid,p_type,v_sub,v_tax,v_fee,v_sub+v_tax+v_fee,p_address,p_notes,p_payment_method) returning id into v_id;
  for e in select * from jsonb_array_elements(p_items) loop
    v_opts := array(select x::uuid from jsonb_array_elements_text(e->'optionIds') x);
    v_unit := item_unit_price((e->>'menuItemId')::uuid, v_opts);
    insert into order_items(order_id,menu_item_id,name_snapshot,unit_price_minor,quantity,instructions,options)
      select v_id, mi.id, mi.name, v_unit, (e->>'quantity')::int, e->>'instructions',
        coalesce((select jsonb_agg(jsonb_build_object('name', o.name, 'delta', o.price_delta_minor)) from item_options o where o.id = any(v_opts)), '[]'::jsonb)
      from menu_items mi where mi.id = (e->>'menuItemId')::uuid;
  end loop;
  insert into order_status_history(order_id,from_status,to_status,changed_by) values (v_id,null,'new',v_uid);
  return v_id;
end $$;

create function record_cash_payment(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; v_role app_role := current_role_name();
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.payment_method <> 'cod' then raise exception 'not a cash order'; end if;
  if o.payment_status <> 'pending' then raise exception 'payment already %', o.payment_status; end if;
  if o.status in ('cancelled','rejected') then raise exception 'order is closed'; end if;
  if v_role = 'owner' then null;
  elsif v_role = 'delivery' and o.type = 'delivery' and o.status in ('out_for_delivery','delivered')
        and exists (select 1 from delivery_assignments where order_id = p_order and staff_id = auth.uid()) then null;
  else raise exception 'forbidden'; end if;
  insert into payments(order_id, provider, provider_ref, status, amount_minor) values (p_order, 'cash', 'cash-' || p_order, 'paid', o.total_minor);
  update orders set payment_status = 'paid' where id = p_order;
  insert into audit_logs(actor, action, entity, entity_id, detail) values (auth.uid(), 'cash_collected', 'order', p_order::text, jsonb_build_object('amount', o.total_minor));
end $$;
revoke execute on function place_order(order_type, jsonb, jsonb, text, text), record_cash_payment(uuid) from public, anon;
grant execute on function place_order(order_type, jsonb, jsonb, text, text), record_cash_payment(uuid) to authenticated;
