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
