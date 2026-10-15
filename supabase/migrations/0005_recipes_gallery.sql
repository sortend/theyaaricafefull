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
