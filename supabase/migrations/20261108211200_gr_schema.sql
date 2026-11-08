-- Galmee Garage schema: vehicles, mechanics, job cards, parts, labour, payments.
-- Job cards and their lines are written only through RPCs (see gr_rpcs migration).

create table public.gr_vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  plate text not null check (char_length(btrim(plate)) between 2 and 20),
  plate_key text generated always as (regexp_replace(upper(plate), '[^0-9A-Zሀ-፿]', '', 'g')) stored,
  customer_id uuid references public.customers(id),
  make text check (char_length(make) <= 60),
  model text check (char_length(model) <= 60),
  year int check (year between 1950 and 2100),
  color text check (char_length(color) <= 40),
  notes text check (char_length(notes) <= 400),
  created_at timestamptz not null default now(),
  unique (tenant_id, plate_key),
  unique (tenant_id, id)
);
create index gr_vehicles_customer_idx on public.gr_vehicles (customer_id);

create table public.gr_mechanics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  phone text check (char_length(phone) <= 20),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name),
  unique (tenant_id, id)
);

create table public.gr_job_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  job_no int not null check (job_no > 0),
  vehicle_id uuid not null,
  customer_id uuid not null references public.customers(id),
  mechanic_id uuid,
  complaint text not null check (char_length(btrim(complaint)) between 2 and 1000),
  work_done text check (char_length(work_done) <= 2000),
  odometer_km int check (odometer_km between 0 and 5000000),
  status text not null default 'open' check (status in ('open','in_progress','waiting_parts','ready','delivered','cancelled')),
  parts_total numeric(12,2) not null default 0 check (parts_total >= 0),
  labour_total numeric(12,2) not null default 0 check (labour_total >= 0),
  paid_total numeric(12,2) not null default 0 check (paid_total >= 0),
  total numeric(12,2) generated always as (parts_total + labour_total) stored,
  balance numeric(12,2) generated always as (parts_total + labour_total - paid_total) stored,
  debt_posted numeric(12,2) not null default 0 check (debt_posted >= 0),
  client_ref uuid,
  created_by uuid default auth.uid(),
  opened_at timestamptz not null default now(),
  ready_at timestamptz,
  delivered_at timestamptz,
  unique (tenant_id, job_no),
  unique (tenant_id, client_ref),
  unique (tenant_id, id),
  foreign key (tenant_id, vehicle_id) references public.gr_vehicles(tenant_id, id),
  foreign key (tenant_id, mechanic_id) references public.gr_mechanics(tenant_id, id)
);
create index gr_job_cards_status_idx on public.gr_job_cards (tenant_id, status);
create index gr_job_cards_vehicle_idx on public.gr_job_cards (vehicle_id, opened_at desc);
create index gr_job_cards_customer_idx on public.gr_job_cards (customer_id);
create index gr_job_cards_mechanic_idx on public.gr_job_cards (mechanic_id);
create index gr_job_cards_tenant_vehicle_idx on public.gr_job_cards (tenant_id, vehicle_id);
create index gr_job_cards_tenant_mechanic_idx on public.gr_job_cards (tenant_id, mechanic_id);
create index gr_job_cards_unpaid_idx on public.gr_job_cards (tenant_id) where balance > 0 and status <> 'cancelled';

create table public.gr_job_parts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  job_id uuid not null,
  item_id uuid not null references public.items(id),
  qty numeric(12,3) not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(qty * unit_price, 2)) stored,
  client_ref uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  unique (tenant_id, client_ref),
  foreign key (tenant_id, job_id) references public.gr_job_cards(tenant_id, id) on delete cascade
);
create index gr_job_parts_job_idx on public.gr_job_parts (tenant_id, job_id);
create index gr_job_parts_item_idx on public.gr_job_parts (item_id);

create table public.gr_job_labour (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  job_id uuid not null,
  mechanic_id uuid,
  description text not null check (char_length(btrim(description)) between 2 and 200),
  amount numeric(12,2) not null check (amount > 0),
  client_ref uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  unique (tenant_id, client_ref),
  foreign key (tenant_id, job_id) references public.gr_job_cards(tenant_id, id) on delete cascade,
  foreign key (tenant_id, mechanic_id) references public.gr_mechanics(tenant_id, id)
);
create index gr_job_labour_job_idx on public.gr_job_labour (tenant_id, job_id);
create index gr_job_labour_mechanic_idx on public.gr_job_labour (tenant_id, mechanic_id);

create table public.gr_job_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  job_id uuid not null,
  payment_id uuid not null references public.payments(id),
  amount numeric(12,2) not null check (amount > 0),
  method public.pay_method not null,
  client_ref uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, client_ref),
  foreign key (tenant_id, job_id) references public.gr_job_cards(tenant_id, id) on delete cascade
);
create index gr_job_payments_job_idx on public.gr_job_payments (tenant_id, job_id);
create index gr_job_payments_payment_idx on public.gr_job_payments (payment_id);

alter table public.gr_vehicles enable row level security;
alter table public.gr_mechanics enable row level security;
alter table public.gr_job_cards enable row level security;
alter table public.gr_job_parts enable row level security;
alter table public.gr_job_labour enable row level security;
alter table public.gr_job_payments enable row level security;

revoke all on public.gr_vehicles, public.gr_mechanics, public.gr_job_cards, public.gr_job_parts, public.gr_job_labour, public.gr_job_payments from anon;
revoke insert, delete, truncate on public.gr_vehicles from authenticated;
revoke truncate on public.gr_mechanics from authenticated;
revoke insert, update, delete, truncate on public.gr_job_cards, public.gr_job_parts, public.gr_job_labour, public.gr_job_payments from authenticated;

create policy gr_vehicles_sel on public.gr_vehicles for select to authenticated using (tenant_id = (select private.current_tenant()));
create policy gr_vehicles_upd on public.gr_vehicles for update to authenticated
  using (tenant_id = (select private.current_tenant()) and (select private.current_app_role()) in ('owner','manager'))
  with check (tenant_id = (select private.current_tenant()));

create policy gr_mechanics_sel on public.gr_mechanics for select to authenticated using (tenant_id = (select private.current_tenant()));
create policy gr_mechanics_ins on public.gr_mechanics for insert to authenticated
  with check (tenant_id = (select private.current_tenant()) and (select private.current_app_role()) in ('owner','manager'));
create policy gr_mechanics_upd on public.gr_mechanics for update to authenticated
  using (tenant_id = (select private.current_tenant()) and (select private.current_app_role()) in ('owner','manager'))
  with check (tenant_id = (select private.current_tenant()));
create policy gr_mechanics_del on public.gr_mechanics for delete to authenticated
  using (tenant_id = (select private.current_tenant()) and (select private.current_app_role()) = 'owner');

create policy gr_job_cards_sel on public.gr_job_cards for select to authenticated using (tenant_id = (select private.current_tenant()));
create policy gr_job_parts_sel on public.gr_job_parts for select to authenticated using (tenant_id = (select private.current_tenant()));
create policy gr_job_labour_sel on public.gr_job_labour for select to authenticated using (tenant_id = (select private.current_tenant()));
create policy gr_job_payments_sel on public.gr_job_payments for select to authenticated using (tenant_id = (select private.current_tenant()));
