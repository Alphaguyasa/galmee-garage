-- Fills the empty tenant named exactly "Galmee Garage Demo" with fictional data:
-- 40 vehicles, 80 parts and about two months of job cards. Owner only, once.
create function private.gr_load_demo_data() returns int
language plpgsql security definer set search_path = public, private as $$
declare
  v_tenant uuid := private.gr_require_tenant();
  v_role user_role := private.current_app_role();
  v_name text;
  v_mechanics uuid[];
  v_vehicles uuid[];
  v_customers uuid[];
  v_items uuid[];
  v_id uuid; v_item uuid; v_batch uuid; v_job uuid; v_pay uuid;
  v_jobs int := 0;
  i int; j int; v_v int; v_when timestamptz; v_status text; v_parts int; v_labour numeric; v_parts_sum numeric; v_price numeric; v_qty int; v_paid numeric; v_mech uuid;
  first_names text[] := array['Abebe','Chaltu','Tesfaye','Hana','Bekele','Meron','Gemechu','Sara','Dawit','Lemlem','Tolosa','Almaz','Yonas','Biftu','Girma','Selam','Kebede','Tigist','Jemal','Rahel'];
  last_names text[] := array['Tadesse','Bulti','Ayana','Hailu','Wolde','Tola','Desta','Negash','Fikadu','Mekonnen'];
  regions text[] := array['AA','OR','OR','AA','SN','OR'];
  makes text[] := array['Toyota','Isuzu','Nissan','Hyundai','Suzuki','Mitsubishi','Bajaj'];
  models text[] := array['Corolla','D-Max','Hilux','Vitz','Sunny','Tucson','Dzire','Alto','RE Tuk-tuk'];
  mech_names text[] := array['Mesfin Getachew','Abdi Roba','Yared Teshome','Fuad Hussen','Biruk Alemu'];
  families text[][] := array[
    ['Brake pad set','የብሬክ ፓድ'],['Oil filter','የዘይት ማጣሪያ'],['Air filter','የአየር ማጣሪያ'],['Fuel filter','የነዳጅ ማጣሪያ'],['Spark plug','ሻማ'],
    ['Engine oil 4L','የሞተር ዘይት 4 ሊትር'],['Radiator hose','የራዲያተር ቱቦ'],['Fan belt','ቀበቶ'],['Shock absorber','ሾክ'],['Wheel bearing','ቢርንግ'],
    ['Clutch plate','ክላች'],['Timing belt','ታይሚንግ ቀበቶ'],['Headlight bulb','የፊት መብራት አምፑል'],['Wiper blade','መጥረጊያ'],['Battery terminal','የባትሪ ተርሚናል'],
    ['Tie rod end','ታይ ሮድ'],['Water pump','የውሃ ፓምፕ'],['Brake fluid','የብሬክ ፈሳሽ'],['Starter relay','ሪሌይ'],['Gasket set','ጋዝኬት']];
  fits text[] := array['Toyota','Isuzu','Nissan','Hyundai'];
  jobs text[] := array['Brakes squeal when stopping','Engine oil service due','Car pulls to the right','Overheats on the hill','Clutch slipping','Battery will not hold charge','Knocking from front suspension','Headlight not working','Hard to start in the morning','Vibration at speed'];
  work text[] := array['Replaced parts and road tested','Serviced and checked levels','Cleaned contacts, tested OK','Replaced worn components','Adjusted and tested'];
begin
  select name into v_name from tenants where id = v_tenant;
  if v_name <> 'Galmee Garage Demo' then raise exception 'not_demo_tenant'; end if;
  if v_role <> 'owner' then raise exception 'not_allowed'; end if;
  if exists (select 1 from gr_vehicles where tenant_id = v_tenant) or exists (select 1 from items where tenant_id = v_tenant) then
    raise exception 'already_loaded';
  end if;

  foreach v_name in array mech_names loop
    insert into gr_mechanics(tenant_id, name, phone) values (v_tenant, v_name, '09' || (11000000 + floor(random()*899999))::int)
    returning id into v_id;
    v_mechanics := v_mechanics || v_id;
  end loop;

  for i in 1..40 loop
    insert into customers(tenant_id, name, phone)
    values (v_tenant, first_names[1 + (i-1) % 20] || ' ' || last_names[1 + (i-1) % 10], '09' || (21000000 + i * 137)::int)
    returning id into v_id;
    v_customers := v_customers || v_id;
    insert into gr_vehicles(tenant_id, plate, customer_id, make, model, year, color)
    values (v_tenant, format('%s-%s %s', 2 + (i % 3), regions[1 + i % 6], 10000 + (i * 2179) % 89999), v_id,
            makes[1 + i % 7], models[1 + i % 9], 2008 + i % 15, (array['White','Silver','Blue','Black','Red'])[1 + i % 5])
    returning id into v_id;
    v_vehicles := v_vehicles || v_id;
  end loop;

  for i in 1..20 loop
    for j in 1..4 loop
      v_price := (80 + (i * 37 + j * 113) % 1900)::numeric;
      insert into items(tenant_id, sku, name_en, name_am, name_om, unit, price, cost, reorder_level)
      values (v_tenant, format('GR-%s-%s', i, j), format('%s (%s)', families[i][1], fits[j]), format('%s (%s)', families[i][2], fits[j]),
              format('%s (%s)', families[i][1], fits[j]), 'pc', v_price, round(v_price * 0.65), 4)
      returning id into v_item;
      v_items := v_items || v_item;
      insert into stock_batches(tenant_id, item_id, batch_no, qty, cost) values (v_tenant, v_item, 'DEMO', 40, round(v_price * 0.65)) returning id into v_batch;
      insert into stock_movements(tenant_id, item_id, batch_id, type, qty, reason) values (v_tenant, v_item, v_batch, 'in', 40, 'demo');
    end loop;
  end loop;

  -- Roughly three jobs a day for 60 days, oldest first; the newest few are still in the yard.
  v_when := now() - interval '60 days';
  while v_when < now() loop
    for j in 1..3 loop
      v_v := 1 + floor(random() * 40)::int;
      continue when exists (select 1 from gr_job_cards c where c.vehicle_id = v_vehicles[v_v] and c.status not in ('delivered','cancelled'));
      v_jobs := v_jobs + 1;
      v_status := case
        when v_when < now() - interval '3 days' then 'delivered'
        else (array['open','in_progress','waiting_parts','ready'])[1 + floor(random()*4)::int] end;
      v_mech := v_mechanics[1 + floor(random()*5)::int];
      insert into gr_job_cards(tenant_id, job_no, vehicle_id, customer_id, mechanic_id, complaint, work_done, odometer_km, status, opened_at, ready_at, delivered_at)
      values (v_tenant, v_jobs, v_vehicles[v_v], v_customers[v_v], v_mech, jobs[1 + floor(random()*10)::int],
              case when v_status in ('ready','delivered') then work[1 + floor(random()*5)::int] end,
              60000 + floor(random()*190000)::int, v_status, v_when + (j * interval '2 hours'),
              case when v_status in ('ready','delivered') then v_when + (j * interval '26 hours') end,
              case when v_status = 'delivered' then v_when + (j * interval '28 hours') end)
      returning id into v_job;

      v_parts := floor(random()*4)::int;
      for i in 1..v_parts loop
        v_item := v_items[1 + floor(random()*80)::int];
        v_qty := 1 + floor(random()*2)::int;
        select b.id into v_batch from stock_batches b where b.item_id = v_item and b.qty >= v_qty limit 1;
        continue when v_batch is null;
        select price into v_price from items where id = v_item;
        update stock_batches set qty = qty - v_qty where id = v_batch;
        insert into gr_job_parts(tenant_id, job_id, item_id, qty, unit_price, created_at)
        values (v_tenant, v_job, v_item, v_qty, v_price, v_when) returning id into v_id;
        insert into stock_movements(tenant_id, item_id, batch_id, type, qty, reason, ref_table, ref_id)
        values (v_tenant, v_item, v_batch, 'out', v_qty, 'job', 'gr_job_parts', v_id);
      end loop;

      v_labour := 150 + floor(random()*18) * 50;
      insert into gr_job_labour(tenant_id, job_id, mechanic_id, description, amount, created_at)
      values (v_tenant, v_job, v_mech, 'Labour', v_labour, v_when);
      perform private.gr_recalc(v_job);
      select parts_total + labour_total into v_parts_sum from gr_job_cards where id = v_job;

      if v_status = 'delivered' then
        -- Most jobs are paid in full; about one in six goes on credit.
        v_paid := case when random() < 0.17 then floor(v_parts_sum * 0.5) else v_parts_sum end;
        if v_paid > 0 then
          insert into payments(tenant_id, customer_id, amount, method, ref_table, ref_id, created_at)
          values (v_tenant, v_customers[v_v], v_paid, (array['cash','telebirr','cbe_birr']::pay_method[])[1 + floor(random()*3)::int], 'gr_job_cards', v_job, v_when)
          returning id into v_pay;
          insert into gr_job_payments(tenant_id, job_id, payment_id, amount, method, created_at)
          select v_tenant, v_job, v_pay, v_paid, p.method, v_when from payments p where p.id = v_pay;
        end if;
        update gr_job_cards set paid_total = v_paid, debt_posted = v_parts_sum - v_paid where id = v_job;
        if v_parts_sum - v_paid > 0 then
          insert into credit_ledger(tenant_id, customer_id, type, amount, ref_table, ref_id, created_at)
          values (v_tenant, v_customers[v_v], 'debt', v_parts_sum - v_paid, 'gr_job_cards', v_job, v_when);
        end if;
      end if;
    end loop;
    v_when := v_when + interval '1 day';
  end loop;
  return v_jobs;
end $$;
revoke all on function private.gr_load_demo_data() from public, anon;
grant execute on function private.gr_load_demo_data() to authenticated;

create function public.gr_load_demo_data() returns int language sql security invoker set search_path = public, private as $$ select private.gr_load_demo_data() $$;
revoke all on function public.gr_load_demo_data() from public, anon;
grant execute on function public.gr_load_demo_data() to authenticated;
