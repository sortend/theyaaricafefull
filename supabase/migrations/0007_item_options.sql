-- Sizes (at most one per line) and add-ons. Price is computed in SQL from the options; the browser sends only ids.
create table item_options (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  kind text not null check (kind in ('size','addon')),
  name text not null, price_delta_minor int not null default 0,
  available boolean not null default true
);
create index on item_options(menu_item_id);
alter table item_options enable row level security;
create policy opt_read on item_options for select using (exists (select 1 from menu_items m where m.id = menu_item_id and m.published and not m.archived) or current_role_name() = 'owner');
create policy opt_owner on item_options for all using (current_role_name()='owner') with check (current_role_name()='owner');
alter table order_items add column options jsonb not null default '[]'::jsonb;

create function item_unit_price(p_item uuid, p_opts uuid[]) returns int
language plpgsql stable security definer set search_path = public as $$
declare v_base int; v_opts uuid[] := array(select distinct unnest(coalesce(p_opts, '{}'))); v_ok int; v_sizes int; v_delta int;
begin
  select price_minor into v_base from menu_items where id = p_item and published and available and not archived;
  if not found then raise exception 'item % unavailable', p_item; end if;
  select count(*), count(*) filter (where kind = 'size'), coalesce(sum(price_delta_minor), 0) into v_ok, v_sizes, v_delta
    from item_options where id = any(v_opts) and menu_item_id = p_item and available;
  if v_ok <> cardinality(v_opts) then raise exception 'invalid option for item %', p_item; end if;
  if v_sizes > 1 then raise exception 'only one size allowed'; end if;
  if v_base + v_delta < 0 then raise exception 'invalid price'; end if;
  return v_base + v_delta;
end $$;

create or replace function place_order(p_type order_type, p_items jsonb, p_address jsonb, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_sub int := 0; v_tax int; v_fee int := 0; v_id uuid; e jsonb; v_opts uuid[]; v_unit int; v_qty int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_type = 'delivery' and p_address is null then raise exception 'address required'; end if;
  for e in select * from jsonb_array_elements(p_items) loop
    v_qty := (e->>'quantity')::int; if v_qty < 1 or v_qty > 50 then raise exception 'invalid quantity'; end if;
    v_opts := array(select x::uuid from jsonb_array_elements_text(e->'optionIds') x);
    v_sub := v_sub + item_unit_price((e->>'menuItemId')::uuid, v_opts) * v_qty;
  end loop;
  v_tax := round(v_sub * (select (value)::int from settings where key='tax_bps') / 10000.0);
  if p_type = 'delivery' then v_fee := (select (value)::int from settings where key='delivery_fee_minor'); end if;
  insert into orders(customer_id,type,subtotal_minor,tax_minor,delivery_fee_minor,total_minor,address,notes)
    values (v_uid,p_type,v_sub,v_tax,v_fee,v_sub+v_tax+v_fee,p_address,p_notes) returning id into v_id;
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
revoke execute on function item_unit_price from public, anon, authenticated;
