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
