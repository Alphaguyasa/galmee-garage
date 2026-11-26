-- gr_service_reminders: per-car service interval (every N km and/or every N months) and a
-- queue call that puts one "service due" SMS per due car in the core notifications queue.
-- The last service is the car's latest handed-over job (its odometer and hand-over date), so
-- nothing has to be kept in step when jobs change.

create table public.gr_service_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  vehicle_id uuid not null,
  every_km integer check (every_km between 500 and 100000),
  every_months integer check (every_months between 1 and 36),
  reminded_key text,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gr_service_plans_interval check (every_km is not null or every_months is not null),
  constraint gr_service_plans_vehicle unique (tenant_id, vehicle_id),
  foreign key (tenant_id, vehicle_id) references public.gr_vehicles(tenant_id, id) on delete cascade
);

alter table public.gr_service_plans enable row level security;
revoke all on public.gr_service_plans from anon;
revoke truncate on public.gr_service_plans from authenticated;

create policy gr_service_plans_sel on public.gr_service_plans for select to authenticated
  using (tenant_id = (select private.current_tenant()));
create policy gr_service_plans_ins on public.gr_service_plans for insert to authenticated
  with check (tenant_id = (select private.current_tenant()) and (select private.current_app_role()) in ('owner','manager'));
create policy gr_service_plans_upd on public.gr_service_plans for update to authenticated
  using (tenant_id = (select private.current_tenant()) and (select private.current_app_role()) in ('owner','manager'))
  with check (tenant_id = (select private.current_tenant()));
create policy gr_service_plans_del on public.gr_service_plans for delete to authenticated
  using (tenant_id = (select private.current_tenant()) and (select private.current_app_role()) in ('owner','manager'));

-- Last service and next due point per plan (security invoker: RLS of the caller applies).
create view public.gr_service_due with (security_invoker = true) as
select p.id as plan_id, p.tenant_id, p.vehicle_id, v.plate, v.customer_id, c.name as customer_name, c.phone,
       p.every_km, p.every_months, p.reminded_key, p.reminded_at,
       j.odometer_km as last_km, (j.delivered_at at time zone 'Africa/Addis_Ababa')::date as last_date,
       case when p.every_km is not null and j.odometer_km is not null then j.odometer_km + p.every_km end as next_km,
       case when p.every_months is not null and j.delivered_at is not null
            then ((j.delivered_at at time zone 'Africa/Addis_Ababa')::date + make_interval(months => p.every_months))::date end as next_date
from public.gr_service_plans p
join public.gr_vehicles v on v.tenant_id = p.tenant_id and v.id = p.vehicle_id
left join public.customers c on c.id = v.customer_id
left join lateral (
  select jc.odometer_km, jc.delivered_at
  from public.gr_job_cards jc
  where jc.tenant_id = p.tenant_id and jc.vehicle_id = p.vehicle_id and jc.status = 'delivered'
  order by jc.delivered_at desc nulls last
  limit 1
) j on true;

revoke all on public.gr_service_due from anon;
grant select on public.gr_service_due to authenticated;

-- Queue one SMS per car whose service falls due within p_days (by date) or whose last
-- recorded odometer is within 500 km of the next service. A car is reminded once per due
-- point (reminded_key), so calling this again the same day queues nothing new.
create or replace function private.gr_queue_service_reminders(p_days integer)
returns integer
language plpgsql
security definer
set search_path = public, private
as $f$
declare
  v_tenant uuid := private.current_tenant();
  v_role text := private.current_app_role();
  v_name text;
  v_count integer := 0;
  r record;
  v_key text;
begin
  if v_tenant is null then raise exception 'not_in_tenant'; end if;
  if v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_days is null or p_days < 0 or p_days > 60 then raise exception 'bad_days'; end if;
  select name into v_name from tenants where id = v_tenant;

  for r in
    select d.* from gr_service_due d
    where d.tenant_id = v_tenant and d.phone is not null and length(trim(d.phone)) > 0
      and (d.next_date <= (now() at time zone 'Africa/Addis_Ababa')::date + p_days
           or (d.next_km is not null and d.last_km is not null and d.last_km >= d.next_km - 500))
  loop
    v_key := coalesce(r.next_date::text, '') || '/' || coalesce(r.next_km::text, '');
    continue when r.reminded_key is not distinct from v_key;
    insert into notifications(tenant_id, channel, to_addr, body)
    values (v_tenant, 'sms', r.phone,
            format('%s: መኪናዎ %s የአገልግሎት (ሰርቪስ) ጊዜ ደርሷል።%s', v_name, r.plate,
                   case when r.next_date is not null then format(' ቀን: %s', to_char(r.next_date, 'DD/MM/YYYY')) else '' end));
    update gr_service_plans set reminded_key = v_key, reminded_at = now(), updated_at = now() where id = r.plan_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$f$;
revoke all on function private.gr_queue_service_reminders(integer) from public, anon;
grant execute on function private.gr_queue_service_reminders(integer) to authenticated;

create or replace function public.gr_queue_service_reminders(p_days integer default 7)
returns integer
language sql
security invoker
set search_path = public, private
as $f$ select private.gr_queue_service_reminders(p_days) $f$;
revoke all on function public.gr_queue_service_reminders(integer) from public, anon;
grant execute on function public.gr_queue_service_reminders(integer) to authenticated;
