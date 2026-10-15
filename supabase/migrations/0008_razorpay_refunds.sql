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
