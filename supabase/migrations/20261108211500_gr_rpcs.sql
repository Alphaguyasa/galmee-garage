-- Galmee Garage server logic. Job writes run as private SECURITY DEFINER functions with
-- explicit tenant and role checks; each is exposed through a SECURITY INVOKER wrapper.

create function private.gr_require_tenant() returns uuid
language plpgsql stable set search_path = public, private as $$
declare v uuid := private.current_tenant();
begin
  if v is null then raise exception 'not_a_member' using errcode = '42501'; end if;
  return v;
end $$;
revoke all on function private.gr_require_tenant() from public, anon;
grant execute on function private.gr_require_tenant() to authenticated;

-- Locks the job row and returns it; only for this tenant.
create function private.gr_lock_job(p_job uuid, p_tenant uuid) returns public.gr_job_cards
language plpgsql set search_path = public, private as $$
declare v gr_job_cards%rowtype;
begin
  select * into v from gr_job_cards where id = p_job and tenant_id = p_tenant for update;
  if not found then raise exception 'job_not_found'; end if;
  return v;
end $$;
revoke all on function private.gr_lock_job(uuid, uuid) from public, anon, authenticated;

create function private.gr_recalc(p_job uuid) returns void
language sql set search_path = public, private as $$
  update gr_job_cards j set
    parts_total = coalesce((select sum(line_total) from gr_job_parts p where p.job_id = j.id and p.reversed_at is null), 0),
    labour_total = coalesce((select sum(amount) from gr_job_labour l where l.job_id = j.id and l.reversed_at is null), 0)
  where j.id = p_job;
$$;
revoke all on function private.gr_recalc(uuid) from public, anon, authenticated;

-- Opens a job for a plate, creating the vehicle and customer when they are new.
create function private.gr_open_job(
  p_plate text, p_complaint text, p_customer uuid, p_customer_name text, p_customer_phone text,
  p_make text, p_model text, p_mechanic uuid, p_odometer int, p_client_ref uuid
) returns uuid language plpgsql security definer set search_path = public, private as $$
declare
  v_tenant uuid := private.gr_require_tenant();
  v_vehicle gr_vehicles%rowtype;
  v_customer uuid := p_customer;
  v_key text := regexp_replace(upper(coalesce(p_plate, '')), '[^0-9A-Zሀ-፿]', '', 'g');
  v_job uuid;
  v_no int;
begin
  if p_client_ref is not null then
    select id into v_job from gr_job_cards where tenant_id = v_tenant and client_ref = p_client_ref;
    if found then return v_job; end if;
  end if;
  if char_length(v_key) < 2 then raise exception 'bad_plate'; end if;
  if coalesce(char_length(btrim(p_complaint)), 0) < 2 then raise exception 'complaint_required'; end if;
  if p_mechanic is not null and not exists (select 1 from gr_mechanics where id = p_mechanic and tenant_id = v_tenant and active) then
    raise exception 'mechanic_not_found';
  end if;
  if v_customer is not null and not exists (select 1 from customers where id = v_customer and tenant_id = v_tenant) then
    raise exception 'customer_not_found';
  end if;

  select * into v_vehicle from gr_vehicles where tenant_id = v_tenant and plate_key = v_key for update;
  if v_customer is null and found then v_customer := v_vehicle.customer_id; end if;
  if v_customer is null then
    if coalesce(btrim(p_customer_name), '') = '' then raise exception 'customer_required'; end if;
    if p_customer_phone is not null then
      select id into v_customer from customers where tenant_id = v_tenant and phone = p_customer_phone order by created_at limit 1;
    end if;
    if v_customer is null then
      insert into customers(tenant_id, name, phone) values (v_tenant, btrim(p_customer_name), p_customer_phone) returning id into v_customer;
    end if;
  end if;

  if v_vehicle.id is null then
    insert into gr_vehicles(tenant_id, plate, customer_id, make, model)
    values (v_tenant, upper(btrim(p_plate)), v_customer, nullif(btrim(p_make), ''), nullif(btrim(p_model), ''))
    returning * into v_vehicle;
  else
    if exists (select 1 from gr_job_cards where vehicle_id = v_vehicle.id and status not in ('delivered','cancelled')) then
      raise exception 'vehicle_has_open_job';
    end if;
    update gr_vehicles set customer_id = v_customer where id = v_vehicle.id and customer_id is distinct from v_customer;
  end if;

  perform pg_advisory_xact_lock(hashtext('gr_job_no:' || v_tenant::text));
  select coalesce(max(job_no), 0) + 1 into v_no from gr_job_cards where tenant_id = v_tenant;
  insert into gr_job_cards(tenant_id, job_no, vehicle_id, customer_id, mechanic_id, complaint, odometer_km, client_ref)
  values (v_tenant, v_no, v_vehicle.id, v_customer, p_mechanic, btrim(p_complaint), p_odometer, p_client_ref)
  returning id into v_job;
  return v_job;
end $$;

-- Takes parts out of stock (FEFO on core batches) and onto the job.
create function private.gr_add_part(p_job uuid, p_item uuid, p_qty numeric, p_unit_price numeric, p_client_ref uuid)
returns uuid language plpgsql security definer set search_path = public, private as $$
declare
  v_tenant uuid := private.gr_require_tenant();
  v_role user_role := private.current_app_role();
  v_job gr_job_cards%rowtype;
  v_item items%rowtype;
  v_price numeric(12,2);
  v_part uuid;
  v_need numeric := p_qty;
  v_take numeric;
  b record;
begin
  if p_client_ref is not null then
    select id into v_part from gr_job_parts where tenant_id = v_tenant and client_ref = p_client_ref;
    if found then return v_part; end if;
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'bad_qty'; end if;
  v_job := private.gr_lock_job(p_job, v_tenant);
  if v_job.status in ('delivered','cancelled') then raise exception 'job_closed'; end if;
  select * into v_item from items where id = p_item and tenant_id = v_tenant and active;
  if not found then raise exception 'item_not_found'; end if;
  v_price := v_item.price;
  if p_unit_price is not null and p_unit_price is distinct from v_item.price then
    if v_role not in ('owner','manager') then raise exception 'price_override_not_allowed'; end if;
    if p_unit_price < 0 then raise exception 'bad_amount'; end if;
    v_price := p_unit_price;
  end if;

  insert into gr_job_parts(tenant_id, job_id, item_id, qty, unit_price, client_ref)
  values (v_tenant, p_job, p_item, p_qty, v_price, p_client_ref) returning id into v_part;

  for b in select id, qty from stock_batches where tenant_id = v_tenant and item_id = p_item and qty > 0
           order by expiry_date nulls last, received_at for update loop
    exit when v_need <= 0;
    v_take := least(b.qty, v_need);
    update stock_batches set qty = qty - v_take where id = b.id;
    insert into stock_movements(tenant_id, item_id, batch_id, type, qty, reason, ref_table, ref_id, user_id)
    values (v_tenant, p_item, b.id, 'out', v_take, 'job', 'gr_job_parts', v_part, auth.uid());
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 then raise exception 'insufficient_stock'; end if;

  perform private.gr_recalc(p_job);
  return v_part;
end $$;

-- Takes a part back off an open job and returns it to the batches it came from.
create function private.gr_reverse_part(p_part uuid) returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_tenant uuid := private.gr_require_tenant();
  v_part gr_job_parts%rowtype;
  v_job gr_job_cards%rowtype;
  m record;
begin
  select * into v_part from gr_job_parts where id = p_part and tenant_id = v_tenant;
  if not found then raise exception 'part_not_found'; end if;
  v_job := private.gr_lock_job(v_part.job_id, v_tenant);
  if v_job.status in ('delivered','cancelled') then raise exception 'job_closed'; end if;
  if v_part.reversed_at is not null then raise exception 'already_reversed'; end if;

  for m in select batch_id, item_id, qty from stock_movements
           where tenant_id = v_tenant and ref_table = 'gr_job_parts' and ref_id = p_part and type = 'out' loop
    update stock_batches set qty = qty + m.qty where id = m.batch_id;
    insert into stock_movements(tenant_id, item_id, batch_id, type, qty, reason, ref_table, ref_id, user_id)
    values (v_tenant, m.item_id, m.batch_id, 'in', m.qty, 'job_reversal', 'gr_job_parts', p_part, auth.uid());
  end loop;

  update gr_job_parts set reversed_at = now(), reversed_by = auth.uid() where id = p_part;
  perform private.gr_recalc(v_part.job_id);
end $$;

create function private.gr_add_labour(p_job uuid, p_description text, p_amount numeric, p_mechanic uuid, p_client_ref uuid)
returns uuid language plpgsql security definer set search_path = public, private as $$
declare
  v_tenant uuid := private.gr_require_tenant();
  v_job gr_job_cards%rowtype;
  v_id uuid;
begin
  if p_client_ref is not null then
    select id into v_id from gr_job_labour where tenant_id = v_tenant and client_ref = p_client_ref;
    if found then return v_id; end if;
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if;
  if coalesce(char_length(btrim(p_description)), 0) < 2 then raise exception 'description_required'; end if;
  v_job := private.gr_lock_job(p_job, v_tenant);
  if v_job.status in ('delivered','cancelled') then raise exception 'job_closed'; end if;
  if p_mechanic is not null and not exists (select 1 from gr_mechanics where id = p_mechanic and tenant_id = v_tenant) then
    raise exception 'mechanic_not_found';
  end if;
  insert into gr_job_labour(tenant_id, job_id, mechanic_id, description, amount, client_ref)
  values (v_tenant, p_job, coalesce(p_mechanic, v_job.mechanic_id), btrim(p_description), p_amount, p_client_ref)
  returning id into v_id;
  perform private.gr_recalc(p_job);
  return v_id;
end $$;

create function private.gr_reverse_labour(p_labour uuid) returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_tenant uuid := private.gr_require_tenant();
  v_line gr_job_labour%rowtype;
  v_job gr_job_cards%rowtype;
begin
  select * into v_line from gr_job_labour where id = p_labour and tenant_id = v_tenant;
  if not found then raise exception 'labour_not_found'; end if;
  v_job := private.gr_lock_job(v_line.job_id, v_tenant);
  if v_job.status in ('delivered','cancelled') then raise exception 'job_closed'; end if;
  if v_line.reversed_at is not null then raise exception 'already_reversed'; end if;
  update gr_job_labour set reversed_at = now(), reversed_by = auth.uid() where id = p_labour;
  perform private.gr_recalc(v_line.job_id);
end $$;

-- Records money against a job. After delivery the unpaid part sits in credit_ledger,
-- so a later payment is also a repayment there.
create function private.gr_pay_job(p_job uuid, p_amount numeric, p_method pay_method, p_reference text, p_client_ref uuid)
returns uuid language plpgsql security definer set search_path = public, private as $$
declare
  v_tenant uuid := private.gr_require_tenant();
  v_job gr_job_cards%rowtype;
  v_pay uuid;
  v_id uuid;
begin
  if p_client_ref is not null then
    select id into v_id from gr_job_payments where tenant_id = v_tenant and client_ref = p_client_ref;
    if found then return v_id; end if;
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if;
  v_job := private.gr_lock_job(p_job, v_tenant);
  if v_job.status = 'cancelled' then raise exception 'job_closed'; end if;
  if p_amount > v_job.balance then raise exception 'overpayment'; end if;

  insert into payments(tenant_id, customer_id, amount, method, reference, ref_table, ref_id, user_id)
  values (v_tenant, v_job.customer_id, p_amount, p_method, nullif(btrim(p_reference), ''), 'gr_job_cards', p_job, auth.uid())
  returning id into v_pay;
  if v_job.status = 'delivered' then
    insert into credit_ledger(tenant_id, customer_id, type, amount, ref_table, ref_id, user_id)
    values (v_tenant, v_job.customer_id, 'repayment', p_amount, 'gr_job_cards', p_job, auth.uid());
  end if;
  insert into gr_job_payments(tenant_id, job_id, payment_id, amount, method, client_ref)
  values (v_tenant, p_job, v_pay, p_amount, p_method, p_client_ref) returning id into v_id;
  update gr_job_cards set paid_total = paid_total + p_amount where id = p_job;
  return v_id;
end $$;

create function private.gr_update_job(p_job uuid, p_mechanic uuid, p_work_done text, p_odometer int)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  v_tenant uuid := private.gr_require_tenant();
  v_job gr_job_cards%rowtype;
begin
  v_job := private.gr_lock_job(p_job, v_tenant);
  if v_job.status in ('delivered','cancelled') then raise exception 'job_closed'; end if;
  if p_mechanic is not null and not exists (select 1 from gr_mechanics where id = p_mechanic and tenant_id = v_tenant and active) then
    raise exception 'mechanic_not_found';
  end if;
  update gr_job_cards set mechanic_id = p_mechanic, work_done = nullif(btrim(p_work_done), ''), odometer_km = p_odometer where id = p_job;
end $$;

-- Moves a job through the yard. Ready queues the customer SMS with the amount due.
-- Delivered with money outstanding posts the debt; only owner or manager may give credit.
create function private.gr_set_status(p_job uuid, p_status text, p_due date)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  v_tenant uuid := private.gr_require_tenant();
  v_role user_role := private.current_app_role();
  v_job gr_job_cards%rowtype;
  v_phone text;
  v_plate text;
  v_tenant_name text;
  v_allowed boolean;
begin
  v_job := private.gr_lock_job(p_job, v_tenant);
  v_allowed := case v_job.status
    when 'open' then p_status in ('in_progress','waiting_parts','ready','cancelled')
    when 'in_progress' then p_status in ('waiting_parts','ready','cancelled')
    when 'waiting_parts' then p_status in ('in_progress','ready','cancelled')
    when 'ready' then p_status in ('in_progress','delivered')
    else false end;
  if not v_allowed then raise exception 'bad_status'; end if;

  if p_status = 'cancelled' then
    if v_job.paid_total > 0 then raise exception 'job_has_payments'; end if;
    if v_job.parts_total > 0 or v_job.labour_total > 0 then raise exception 'job_has_lines'; end if;
  elsif p_status = 'ready' then
    select phone into v_phone from customers where id = v_job.customer_id;
    if v_phone is not null then
      select plate into v_plate from gr_vehicles where id = v_job.vehicle_id;
      select name into v_tenant_name from tenants where id = v_tenant;
      insert into notifications(tenant_id, channel, to_addr, body)
      values (v_tenant, 'sms', v_phone,
              format('%s: መኪናዎ %s ዝግጁ ነው። የሚከፈል ብር %s', v_tenant_name, v_plate, to_char(v_job.balance, 'FM999,999,990.00')));
    end if;
  elsif p_status = 'delivered' and v_job.balance > 0 then
    if v_role not in ('owner','manager') then raise exception 'balance_due'; end if;
    insert into credit_ledger(tenant_id, customer_id, type, amount, due_date, ref_table, ref_id, user_id)
    values (v_tenant, v_job.customer_id, 'debt', v_job.balance, p_due, 'gr_job_cards', p_job, auth.uid());
  end if;

  update gr_job_cards set
    status = p_status,
    ready_at = case when p_status = 'ready' then now() else ready_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    debt_posted = case when p_status = 'delivered' then greatest(v_job.balance, 0) else debt_posted end
  where id = p_job;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'gr_open_job(text,text,uuid,text,text,text,text,uuid,int,uuid)',
    'gr_add_part(uuid,uuid,numeric,numeric,uuid)',
    'gr_reverse_part(uuid)',
    'gr_add_labour(uuid,text,numeric,uuid,uuid)',
    'gr_reverse_labour(uuid)',
    'gr_pay_job(uuid,numeric,pay_method,text,uuid)',
    'gr_update_job(uuid,uuid,text,int)',
    'gr_set_status(uuid,text,date)'
  ] loop
    execute format('revoke all on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;

create function public.gr_open_job(
  p_plate text, p_complaint text, p_customer uuid default null, p_customer_name text default null, p_customer_phone text default null,
  p_make text default null, p_model text default null, p_mechanic uuid default null, p_odometer int default null, p_client_ref uuid default null
) returns uuid language sql security invoker set search_path = public, private as
$$ select private.gr_open_job(p_plate, p_complaint, p_customer, p_customer_name, p_customer_phone, p_make, p_model, p_mechanic, p_odometer, p_client_ref) $$;
create function public.gr_add_part(p_job uuid, p_item uuid, p_qty numeric, p_unit_price numeric default null, p_client_ref uuid default null)
returns uuid language sql security invoker set search_path = public, private as $$ select private.gr_add_part(p_job, p_item, p_qty, p_unit_price, p_client_ref) $$;
create function public.gr_reverse_part(p_part uuid)
returns void language sql security invoker set search_path = public, private as $$ select private.gr_reverse_part(p_part) $$;
create function public.gr_add_labour(p_job uuid, p_description text, p_amount numeric, p_mechanic uuid default null, p_client_ref uuid default null)
returns uuid language sql security invoker set search_path = public, private as $$ select private.gr_add_labour(p_job, p_description, p_amount, p_mechanic, p_client_ref) $$;
create function public.gr_reverse_labour(p_labour uuid)
returns void language sql security invoker set search_path = public, private as $$ select private.gr_reverse_labour(p_labour) $$;
create function public.gr_pay_job(p_job uuid, p_amount numeric, p_method pay_method default 'cash', p_reference text default null, p_client_ref uuid default null)
returns uuid language sql security invoker set search_path = public, private as $$ select private.gr_pay_job(p_job, p_amount, p_method, p_reference, p_client_ref) $$;
create function public.gr_update_job(p_job uuid, p_mechanic uuid default null, p_work_done text default null, p_odometer int default null)
returns void language sql security invoker set search_path = public, private as $$ select private.gr_update_job(p_job, p_mechanic, p_work_done, p_odometer) $$;
create function public.gr_set_status(p_job uuid, p_status text, p_due date default null)
returns void language sql security invoker set search_path = public, private as $$ select private.gr_set_status(p_job, p_status, p_due) $$;

do $$
declare f text;
begin
  foreach f in array array[
    'gr_open_job(text,text,uuid,text,text,text,text,uuid,int,uuid)',
    'gr_add_part(uuid,uuid,numeric,numeric,uuid)',
    'gr_reverse_part(uuid)',
    'gr_add_labour(uuid,text,numeric,uuid,uuid)',
    'gr_reverse_labour(uuid)',
    'gr_pay_job(uuid,numeric,pay_method,text,uuid)',
    'gr_update_job(uuid,uuid,text,int)',
    'gr_set_status(uuid,text,date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
