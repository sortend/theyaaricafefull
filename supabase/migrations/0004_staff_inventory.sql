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
