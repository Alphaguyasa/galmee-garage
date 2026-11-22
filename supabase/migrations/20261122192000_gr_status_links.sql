-- Courtesy status link: the garage shares a tokened link per job, and the customer
-- sees the job's progress (in work / waiting parts / ready / handed over) without
-- logging in and without calling the garage.
--
-- How the public read works without a SECURITY DEFINER function:
--   * the app server sends the token in the `x-status-token` request header;
--   * PostgREST exposes request headers as `request.headers`;
--   * anon's policy on gr_status_links only matches the one link whose token equals
--     that header, so anon can never list links;
--   * anon's policy on gr_job_cards only matches the job of a link anon can see, and
--     anon has SELECT on a few harmless columns only (no customer, complaint or notes).
-- Garage name/phone and the plate are copied onto the link when it is created, so
-- anon needs no access to tenants or gr_vehicles.

create table public.gr_status_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  job_id uuid not null,
  token text not null default encode(extensions.gen_random_bytes(24), 'hex') check (token ~ '^[0-9a-f]{48}$'),
  garage_name text not null default '' check (char_length(garage_name) <= 120),
  garage_phone text check (char_length(garage_phone) <= 40),
  plate text not null default '' check (char_length(plate) <= 20),
  vehicle_label text check (char_length(vehicle_label) <= 130),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (token),
  foreign key (tenant_id, job_id) references public.gr_job_cards(tenant_id, id) on delete cascade
);
-- One live link per job; sharing again reuses it until it is switched off.
create unique index gr_status_links_live_idx on public.gr_status_links (job_id) where revoked_at is null;
create index gr_status_links_tenant_idx on public.gr_status_links (tenant_id);

-- Fill the copied fields from the job's own tenant and vehicle (runs as the caller,
-- so RLS still decides what can be read).
create function private.gr_status_link_fill() returns trigger
language plpgsql security invoker set search_path = public, private as $$
declare
  v_vehicle public.gr_vehicles;
begin
  select t.name, t.phone into new.garage_name, new.garage_phone
    from public.tenants t where t.id = new.tenant_id;
  select v.* into v_vehicle
    from public.gr_job_cards j join public.gr_vehicles v on v.tenant_id = j.tenant_id and v.id = j.vehicle_id
   where j.tenant_id = new.tenant_id and j.id = new.job_id;
  if v_vehicle.id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  new.garage_name := coalesce(left(new.garage_name, 120), '');
  new.garage_phone := left(new.garage_phone, 40);
  new.plate := left(v_vehicle.plate, 20);
  new.vehicle_label := nullif(left(btrim(concat_ws(' ', v_vehicle.make, v_vehicle.model)), 130), '');
  new.created_by := auth.uid();
  new.created_at := now();
  new.revoked_at := null;
  return new;
end $$;
revoke all on function private.gr_status_link_fill() from public, anon;
grant execute on function private.gr_status_link_fill() to authenticated;

create trigger gr_status_links_fill before insert on public.gr_status_links
  for each row execute function private.gr_status_link_fill();

alter table public.gr_status_links enable row level security;

revoke all on public.gr_status_links from anon, authenticated;
grant select on public.gr_status_links to authenticated;
grant insert (job_id) on public.gr_status_links to authenticated;
grant update (revoked_at) on public.gr_status_links to authenticated;
grant select (job_id, garage_name, garage_phone, plate, vehicle_label) on public.gr_status_links to anon;

create policy gr_status_links_sel on public.gr_status_links for select to authenticated
  using (tenant_id = (select private.current_tenant()));
create policy gr_status_links_ins on public.gr_status_links for insert to authenticated
  with check (tenant_id = (select private.current_tenant()));
create policy gr_status_links_upd on public.gr_status_links for update to authenticated
  using (tenant_id = (select private.current_tenant()))
  with check (tenant_id = (select private.current_tenant()) and revoked_at is not null);
create policy gr_status_links_public on public.gr_status_links for select to anon
  using (
    revoked_at is null
    and token = (nullif(current_setting('request.headers', true), '')::json ->> 'x-status-token')
  );

-- The job behind a visible link; hidden again 14 days after the car is handed over.
grant select (id, job_no, status, opened_at, ready_at, delivered_at, total, balance) on public.gr_job_cards to anon;
create policy gr_job_cards_public on public.gr_job_cards for select to anon
  using (
    id in (select l.job_id from public.gr_status_links l)
    and (delivered_at is null or delivered_at > now() - interval '14 days')
  );
