-- Run against a LOCAL database after `supabase db reset` (includes seed.sql):
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/order_flow.test.sql
-- Rolls back at the end. Not yet executed in CI.
begin;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000c1','cust@test.local'),('00000000-0000-0000-0000-0000000000b1','kitchen@test.local');
update profiles set role='kitchen' where id='00000000-0000-0000-0000-0000000000b1';
create function pg_temp.act(u uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true); end $$;
create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
do $$
declare v_item uuid; v_order uuid; v_total int; v_price int; n int;
begin
  select id, price_minor into v_item, v_price from menu_items where published limit 1;
  perform pg_temp.act('00000000-0000-0000-0000-0000000000c1');
  v_order := place_order('pickup', jsonb_build_array(jsonb_build_object('menuItemId', v_item, 'quantity', 2)), null, null);
  select total_minor into v_total from orders where id = v_order;
  assert v_total = v_price*2 + round(v_price*2*500/10000.0), 'server total must be price*qty + 5% tax';
  assert pg_temp.fails(format('select transition_order(%L,''accepted'')', v_order)), 'customer must not transition orders';
  assert pg_temp.fails('update profiles set role=''owner'' where id=auth.uid()'), 'customer must not self-promote';
  update profiles set full_name='Test Customer' where id=auth.uid(); get diagnostics n = row_count; assert n = 1, 'customer can edit own name';
  assert pg_temp.fails(format('update orders set payment_status=''paid'' where id=%L', v_order)) or
         (select payment_status from orders where id=v_order) = 'pending', 'customer must not mark paid';
  perform pg_temp.act('00000000-0000-0000-0000-0000000000b1');
  perform transition_order(v_order, 'accepted'); perform transition_order(v_order, 'preparing'); perform transition_order(v_order, 'ready');
  assert pg_temp.fails(format('select transition_order(%L,''delivered'')', v_order)), 'kitchen must not deliver';
  reset role;
  assert apply_payment_event('evt1','test','ref1',v_order,v_total,'paid','{}') = 'applied';
  assert apply_payment_event('evt1','test','ref1',v_order,v_total,'paid','{}') = 'duplicate', 'duplicate events are ignored';
  assert (select payment_status from orders where id=v_order) = 'paid';
  assert pg_temp.fails(format('select apply_payment_event(''evt2'',''test'',''ref2'',%L,1,''paid'',''{}'')', v_order)), 'amount mismatch rejected';
  raise notice 'ALL ORDER-FLOW ASSERTIONS PASSED';
end $$;
do $$
declare v_item uuid; v_l uuid; v_s uuid; v_x uuid; v_o uuid; v_total int; v_price int; v_base int;
begin
  select id, price_minor into v_item, v_price from menu_items where published limit 1;
  insert into item_options(menu_item_id,kind,name,price_delta_minor) values (v_item,'size','Large',5000) returning id into v_l;
  insert into item_options(menu_item_id,kind,name,price_delta_minor) values (v_item,'size','Small',-1000) returning id into v_s;
  insert into item_options(menu_item_id,kind,name,price_delta_minor) values (v_item,'addon','Extra shot',3000) returning id into v_x;
  perform pg_temp.act('00000000-0000-0000-0000-0000000000c1');
  v_o := place_order('pickup', jsonb_build_array(jsonb_build_object('menuItemId',v_item,'quantity',1,'optionIds',jsonb_build_array(v_l,v_x))), null, null);
  select total_minor into v_total from orders where id = v_o; v_base := v_price + 8000;
  assert v_total = v_base + round(v_base*500/10000.0), 'options must be priced server-side';
  assert (select count(*) from order_items where order_id = v_o and jsonb_array_length(options) = 2) = 1, 'option snapshot stored';
  assert pg_temp.fails(format('select place_order(''pickup'', %L::jsonb, null, null)', jsonb_build_array(jsonb_build_object('menuItemId',v_item,'quantity',1,'optionIds',jsonb_build_array(gen_random_uuid())))::text)), 'unknown option rejected';
  assert pg_temp.fails(format('select place_order(''pickup'', %L::jsonb, null, null)', jsonb_build_array(jsonb_build_object('menuItemId',v_item,'quantity',1,'optionIds',jsonb_build_array(v_l,v_s)))::text)), 'two sizes rejected';
  assert pg_temp.fails(format('select item_unit_price(%L, ''{}'')', v_item)), 'helper not callable by customers';
  reset role;
  raise notice 'ALL VARIANT ASSERTIONS PASSED';
end $$;
rollback;
