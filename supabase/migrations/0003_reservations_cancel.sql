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
