-- LOCAL DEVELOPMENT ONLY. Never run against production.
insert into categories(name,sort) values ('Coffee',1),('Pastries',2);
insert into menu_items(category_id,name,description,price_minor,published)
select id,'Signature Espresso','Double shot, single-origin',18000,true from categories where name='Coffee';
