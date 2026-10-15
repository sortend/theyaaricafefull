-- The Yaari Café: ALL migrations in order (0001-0009) for pasting into Supabase Dashboard > SQL Editor.
-- Do NOT add seed.sql on production.

-- ===== 0001_core.sql =====
-- Core schema, RLS, server-side pricing and role-gated transitions.
create type app_role as enum ('customer','kitchen','delivery','owner');
create type order_type as enum ('delivery','pickup','dine_in');
create type order_status as enum ('new','accepted','preparing','ready','out_for_delivery','delivered','completed','rejected','cancelled');
create type payment_status as enum ('pending','paid','failed','refunded','partially_refunded');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null default 'customer',
  full_name text, phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Staff can never self-promote: clients may only update these two columns.
revoke update on profiles from authenticated, anon;
grant update (full_name, phone) on profiles to authenticated;

create function current_role_name() returns app_role language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as
$$ begin insert into profiles(id, full_name) values (new.id, new.raw_user_meta_data->>'full_name'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create table settings (key text primary key, value jsonb not null);
insert into settings values ('tax_bps','500'),('delivery_fee_minor','4000'),('currency','"INR"');

create table categories (id uuid primary key default gen_random_uuid(), name text not null unique, sort int not null default 0);
create table menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id),
  name text not null, description text, image_path text,
  price_minor int not null check (price_minor >= 0),
  published boolean not null default false,
  available boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create sequence order_number_seq start 1001;
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null unique default nextval('order_number_seq'),
  customer_id uuid not null references auth.users(id),
  type order_type not null,
  status order_status not null default 'new',
  payment_status payment_status not null default 'pending',
  subtotal_minor int not null, tax_minor int not null, delivery_fee_minor int not null,
  total_minor int not null check (total_minor >= 0),
  address jsonb, notes text,
  created_at timestamptz not null default now()
);
create index on orders(customer_id); create index on orders(status, created_at);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id),
  name_snapshot text not null, unit_price_minor int not null,
  quantity int not null check (quantity > 0), instructions text
);
create table order_status_history (
  id bigserial primary key, order_id uuid not null references orders(id) on delete cascade,
  from_status order_status, to_status order_status not null,
  changed_by uuid, created_at timestamptz not null default now()
);
create table payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id),
  provider text not null, provider_ref text unique, status payment_status not null default 'pending',
  amount_minor int not null, created_at timestamptz not null default now()
);
-- Webhook idempotency: insert provider event id first; unique violation = already processed.
create table payment_events (provider_event_id text primary key, payload jsonb not null, received_at timestamptz not null default now());
create table delivery_assignments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references orders(id),
  staff_id uuid not null references profiles(id), status text not null default 'assigned',
  created_at timestamptz not null default now()
);
create table audit_logs (id bigserial primary key, actor uuid, action text not null, entity text, entity_id text, detail jsonb, created_at timestamptz not null default now());

alter table profiles enable row level security;       alter table settings enable row level security;
alter table categories enable row level security;     alter table menu_items enable row level security;
alter table orders enable row level security;         alter table order_items enable row level security;
alter table order_status_history enable row level security; alter table payments enable row level security;
alter table payment_events enable row level security; alter table delivery_assignments enable row level security;
alter table audit_logs enable row level security;

create policy profiles_self on profiles for select using (id = auth.uid() or current_role_name() = 'owner');
create policy cat_read on categories for select using (true);
create policy cat_owner on categories for all using (current_role_name()='owner') with check (current_role_name()='owner');
create policy menu_read on menu_items for select using ((published and not archived) or current_role_name()='owner');
create policy menu_owner on menu_items for all using (current_role_name()='owner') with check (current_role_name()='owner');
create policy settings_owner on settings for all using (current_role_name()='owner') with check (current_role_name()='owner');

create policy orders_read on orders for select using (
  customer_id = auth.uid() or current_role_name() in ('owner','kitchen')
  or exists (select 1 from delivery_assignments d where d.order_id = orders.id and d.staff_id = auth.uid()));
create policy oi_read on order_items for select using (exists (select 1 from orders o where o.id = order_id));
create policy hist_read on order_status_history for select using (exists (select 1 from orders o where o.id = order_id));
create policy pay_read on payments for select using (current_role_name() in ('owner','kitchen') or exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy da_read on delivery_assignments for select using (staff_id = auth.uid() or current_role_name()='owner');
create policy audit_owner on audit_logs for select using (current_role_name()='owner');
-- No insert/update/delete policies on orders, payments, events: writes go only through the functions below or the service role.

create function place_order(p_type order_type, p_items jsonb, p_address jsonb, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_sub int := 0; v_tax int; v_fee int := 0; v_id uuid; r record; m menu_items;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_type = 'delivery' and p_address is null then raise exception 'address required'; end if;
  for r in select (e->>'menuItemId')::uuid as id, (e->>'quantity')::int as qty from jsonb_array_elements(p_items) e loop
    select * into m from menu_items where id = r.id and published and available and not archived;
    if not found then raise exception 'item % unavailable', r.id; end if;
    v_sub := v_sub + m.price_minor * r.qty;
  end loop;
  v_tax := round(v_sub * (select (value)::int from settings where key='tax_bps') / 10000.0);
  if p_type = 'delivery' then v_fee := (select (value)::int from settings where key='delivery_fee_minor'); end if;
  insert into orders(customer_id,type,subtotal_minor,tax_minor,delivery_fee_minor,total_minor,address,notes)
    values (v_uid,p_type,v_sub,v_tax,v_fee,v_sub+v_tax+v_fee,p_address,p_notes) returning id into v_id;
  insert into order_items(order_id,menu_item_id,name_snapshot,unit_price_minor,quantity,instructions)
    select v_id, mi.id, mi.name, mi.price_minor, (e->>'quantity')::int, e->>'instructions'
    from jsonb_array_elements(p_items) e join menu_items mi on mi.id = (e->>'menuItemId')::uuid;
  insert into order_status_history(order_id,from_status,to_status,changed_by) values (v_id,null,'new',v_uid);
  return v_id;
end $$;

create function transition_order(p_order uuid, p_to order_status) returns void
language plpgsql security definer set search_path = public as $$
declare v_role app_role := current_role_name(); v_from order_status; ok boolean;
begin
  select status into v_from from orders where id = p_order for update;
  if v_from is null or v_role is null or v_role = 'customer' then raise exception 'forbidden'; end if;
  ok := (v_role = 'owner' and (v_from, p_to) in (('new','accepted'),('new','rejected'),('new','cancelled'),('accepted','preparing'),('accepted','cancelled'),('preparing','ready'),('preparing','cancelled'),('ready','out_for_delivery'),('ready','completed'),('ready','cancelled'),('out_for_delivery','delivered'),('out_for_delivery','cancelled'),('delivered','completed')))
     or (v_role = 'kitchen' and (v_from, p_to) in (('new','accepted'),('new','rejected'),('accepted','preparing'),('preparing','ready')))
     or (v_role = 'delivery' and (v_from, p_to) in (('ready','out_for_delivery'),('out_for_delivery','delivered'))
        and exists (select 1 from delivery_assignments where order_id = p_order and staff_id = auth.uid()));
  if not coalesce(ok,false) then raise exception 'transition % -> % not allowed for %', v_from, p_to, v_role; end if;
  update orders set status = p_to where id = p_order;
  insert into order_status_history(order_id,from_status,to_status,changed_by) values (p_order,v_from,p_to,auth.uid());
end $$;

revoke execute on function place_order, transition_order from public, anon;
grant execute on function place_order, transition_order to authenticated;
alter publication supabase_realtime add table orders;


-- ===== 0002_delivery_payments_audit.sql =====
-- Owner assigns delivery; staff accept/reject; payment events are idempotent and service-role only.
create function assign_delivery(p_order uuid, p_staff uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if current_role_name() is distinct from 'owner' then raise exception 'forbidden'; end if;
  if not exists (select 1 from profiles where id = p_staff and role = 'delivery' and active) then raise exception 'invalid delivery staff'; end if;
  insert into delivery_assignments(order_id, staff_id, status) values (p_order, p_staff, 'assigned')
    on conflict (order_id) do update set staff_id = excluded.staff_id, status = 'assigned';
  insert into audit_logs(actor, action, entity, entity_id, detail) values (auth.uid(), 'assign_delivery', 'order', p_order::text, jsonb_build_object('staff', p_staff));
end $$;

create function respond_assignment(p_order uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update delivery_assignments set status = case when p_accept then 'accepted' else 'rejected' end
    where order_id = p_order and staff_id = auth.uid() and status = 'assigned';
  if not found then raise exception 'no pending assignment'; end if;
  insert into audit_logs(actor, action, entity, entity_id) values (auth.uid(), case when p_accept then 'accept_delivery' else 'reject_delivery' end, 'order', p_order::text);
end $$;

-- Called ONLY by the server-side webhook handler (service role) after signature verification.
create function apply_payment_event(p_event_id text, p_provider text, p_ref text, p_order uuid, p_amount int, p_status payment_status, p_payload jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_total int;
begin
  insert into payment_events(provider_event_id, payload) values (p_event_id, p_payload) on conflict do nothing;
  if not found then return 'duplicate'; end if;
  select total_minor into v_total from orders where id = p_order for update;
  if v_total is null then raise exception 'unknown order'; end if;
  if p_status = 'paid' and p_amount <> v_total then raise exception 'amount mismatch'; end if;
  insert into payments(order_id, provider, provider_ref, status, amount_minor) values (p_order, p_provider, p_ref, p_status, p_amount)
    on conflict (provider_ref) do update set status = excluded.status;
  update orders set payment_status = p_status where id = p_order;
  insert into audit_logs(actor, action, entity, entity_id, detail) values (null, 'payment_event', 'order', p_order::text, jsonb_build_object('event', p_event_id, 'status', p_status));
  return 'applied';
end $$;

revoke execute on function assign_delivery, respond_assignment, apply_payment_event from public, anon;
grant execute on function assign_delivery, respond_assignment to authenticated;
grant execute on function apply_payment_event to service_role;
alter publication supabase_realtime add table delivery_assignments;


-- ===== 0003_reservations_cancel.sql =====
insert into settings values ('max_covers_per_slot','40') on conflict do nothing;
create table reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id),
  party_size int not null check (party_size between 1 and 20),
  starts_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','cancelled')),
  notes text, created_at timestamptz not null default now()
);
create index on reservations(starts_at);
alter table reservations enable row level security;
create policy res_read on reservations for select using (customer_id = auth.uid() or current_role_name() = 'owner');
-- writes only via functions below

create function slot_has_room(p_start timestamptz, p_party int, p_exclude uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(sum(party_size),0) + p_party <= (select (value)::int from settings where key='max_covers_per_slot')
  from reservations where status in ('pending','confirmed') and id is distinct from p_exclude
    and starts_at > p_start - interval '2 hours' and starts_at < p_start + interval '2 hours' $$;

create function create_reservation(p_party int, p_start timestamptz, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_start <= now() then raise exception 'time must be in the future'; end if;
  perform pg_advisory_xact_lock(hashtext('reservations'));
  if not slot_has_room(p_start, p_party, null) then raise exception 'no tables available at that time'; end if;
  insert into reservations(customer_id, party_size, starts_at, notes) values (auth.uid(), p_party, p_start, p_notes) returning id into v_id;
  return v_id;
end $$;

create function set_reservation_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare r reservations;
begin
  select * into r from reservations where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if current_role_name() = 'owner' then
    if p_status not in ('confirmed','rejected','cancelled') then raise exception 'invalid status'; end if;
  elsif r.customer_id = auth.uid() and p_status = 'cancelled' then null;
  else raise exception 'forbidden'; end if;
  update reservations set status = p_status where id = p_id;
  insert into audit_logs(actor, action, entity, entity_id, detail) values (auth.uid(), 'reservation_status', 'reservation', p_id::text, jsonb_build_object('to', p_status));
end $$;

create function reschedule_reservation(p_id uuid, p_start timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare r reservations;
begin
  if current_role_name() is distinct from 'owner' then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext('reservations'));
  select * into r from reservations where id = p_id for update;
  if not slot_has_room(p_start, r.party_size, p_id) then raise exception 'no tables available at that time'; end if;
  update reservations set starts_at = p_start where id = p_id;
  insert into audit_logs(actor, action, entity, entity_id, detail) values (auth.uid(), 'reservation_reschedule', 'reservation', p_id::text, jsonb_build_object('to', p_start));
end $$;

-- Customer may cancel only while the kitchen hasn't accepted and nothing has been paid.
create function cancel_my_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_from order_status;
begin
  select status into v_from from orders where id = p_order and customer_id = auth.uid() and payment_status = 'pending' for update;
  if v_from is distinct from 'new' then raise exception 'order can no longer be cancelled'; end if;
  update orders set status = 'cancelled' where id = p_order;
  insert into order_status_history(order_id, from_status, to_status, changed_by) values (p_order, 'new', 'cancelled', auth.uid());
end $$;

revoke execute on function slot_has_room, create_reservation, set_reservation_status, reschedule_reservation, cancel_my_order from public, anon;
grant execute on function create_reservation, set_reservation_status, reschedule_reservation, cancel_my_order to authenticated;


-- ===== 0004_staff_inventory.sql =====
-- Staff role management: owner only, never self, never mints owners from the app.
create function set_staff_role(p_user uuid, p_role app_role, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if current_role_name() is distinct from 'owner' then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'cannot change your own role'; end if;
  if p_role = 'owner' then raise exception 'owner accounts are provisioned only via the create-owner script'; end if;
  if exists (select 1 from profiles where id = p_user and role = 'owner') then raise exception 'cannot modify an owner'; end if;
  update profiles set role = p_role, active = p_active where id = p_user;
  if not found then raise exception 'user not found'; end if;
  insert into audit_logs(actor, action, entity, entity_id, detail) values (auth.uid(), 'set_staff_role', 'profile', p_user::text, jsonb_build_object('role', p_role, 'active', p_active));
end $$;

create table ingredients (
  id uuid primary key default gen_random_uuid(), name text not null unique, unit text not null,
  quantity numeric not null default 0 check (quantity >= 0), reorder_level numeric not null default 0, supplier text
);
create table stock_movements (
  id bigserial primary key, ingredient_id uuid not null references ingredients(id), delta numeric not null,
  reason text not null check (length(trim(reason)) > 0), created_by uuid, created_at timestamptz not null default now()
);
alter table ingredients enable row level security; alter table stock_movements enable row level security;
create policy ing_owner on ingredients for all using (current_role_name()='owner') with check (current_role_name()='owner');
create policy mov_owner on stock_movements for select using (current_role_name()='owner');
-- Quantity can change only through adjust_stock (so every change has a reason and a history row).
revoke insert, update on ingredients from authenticated, anon;
grant insert (name, unit, reorder_level, supplier), update (name, unit, reorder_level, supplier) on ingredients to authenticated;

create function adjust_stock(p_ing uuid, p_delta numeric, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if current_role_name() is distinct from 'owner' then raise exception 'forbidden'; end if;
  update ingredients set quantity = quantity + p_delta where id = p_ing;
  if not found then raise exception 'ingredient not found'; end if;
  insert into stock_movements(ingredient_id, delta, reason, created_by) values (p_ing, p_delta, p_reason, auth.uid());
end $$;
revoke execute on function set_staff_role, adjust_stock from public, anon;
grant execute on function set_staff_role, adjust_stock to authenticated;


-- ===== 0005_recipes_gallery.sql =====
-- Negative stock is allowed on purpose: it makes shortages visible instead of blocking the kitchen.
alter table ingredients drop constraint if exists ingredients_quantity_check;
create table recipes (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  qty numeric not null check (qty > 0), primary key (menu_item_id, ingredient_id)
);
alter table recipes enable row level security;
create policy recipes_owner on recipes for all using (current_role_name()='owner') with check (current_role_name()='owner');

-- Stock is deducted once, when an order first becomes 'accepted'. Items without recipes deduct nothing.
create function deduct_stock_on_accept() returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    for r in select rc.ingredient_id, sum(rc.qty * oi.quantity) as need from order_items oi join recipes rc on rc.menu_item_id = oi.menu_item_id where oi.order_id = new.id group by rc.ingredient_id loop
      update ingredients set quantity = quantity - r.need where id = r.ingredient_id;
      insert into stock_movements(ingredient_id, delta, reason) values (r.ingredient_id, -r.need, 'Order #' || new.order_number);
    end loop;
  end if;
  return new;
end $$;
create trigger trg_deduct_stock after update of status on orders for each row execute function deduct_stock_on_accept();

insert into storage.buckets (id, name, public) values ('gallery', 'gallery', true) on conflict do nothing;
create policy gallery_read on storage.objects for select using (bucket_id = 'gallery');
create policy gallery_owner_write on storage.objects for all using (bucket_id = 'gallery' and current_role_name() = 'owner') with check (bucket_id = 'gallery' and current_role_name() = 'owner');


-- ===== 0006_profile_update.sql =====
-- Customers may edit their own row; column grants (full_name, phone only) still block role/active changes.
create policy profiles_update_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());


-- ===== 0007_item_options.sql =====
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


-- ===== 0008_razorpay_refunds.sql =====
alter table payments add column provider_payment_id text;
create unique index payments_provider_payment_id_key on payments(provider_payment_id) where provider_payment_id is not null;
create table refunds (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id),
  provider_refund_id text unique, amount_minor int not null check (amount_minor > 0),
  status text not null default 'pending' check (status in ('pending','processed','failed')),
  created_by uuid, created_at timestamptz not null default now()
);
alter table refunds enable row level security;
create policy refunds_owner_read on refunds for select using (current_role_name() = 'owner');
-- Writes happen only server-side with the service role (refund API route + verified webhook).


-- ===== 0009_cash_on_delivery.sql =====
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
