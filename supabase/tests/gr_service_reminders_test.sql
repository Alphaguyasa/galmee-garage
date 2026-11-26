-- Service reminders test. Runs inside one block that applies the migration first (see the
-- runner note in the decision log), builds two garages, and RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); us uuid := gen_random_uuid();
  ta uuid; tb uuid; ca uuid; cb uuid; va uuid; va2 uuid; vb uuid; n int; r text := ''; ok boolean;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','gr-svc-a@test.invalid'),
    (ub,'authenticated','authenticated','gr-svc-b@test.invalid'),
    (us,'authenticated','authenticated','gr-svc-s@test.invalid');
  insert into public.tenants(name, vertical) values ('Svc Test A','garage') returning id into ta;
  insert into public.tenants(name, vertical) values ('Svc Test B','garage') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values
    (ua, ta, 'A owner','owner'), (ub, tb, 'B owner','owner'), (us, ta, 'A staff','staff');
  insert into public.customers(tenant_id, name, phone) values (ta,'Cust A','0911000001') returning id into ca;
  insert into public.customers(tenant_id, name, phone) values (tb,'Cust B','0911000002') returning id into cb;
  insert into public.gr_vehicles(tenant_id, plate, customer_id) values (ta,'3-A12345',ca) returning id into va;
  insert into public.gr_vehicles(tenant_id, plate, customer_id) values (ta,'3-A99999',ca) returning id into va2;
  insert into public.gr_vehicles(tenant_id, plate, customer_id) values (tb,'OR-B54321',cb) returning id into vb;
  -- va: serviced 7 months ago (due by date); va2: serviced last week (not due); vb: B's car, due.
  insert into public.gr_job_cards(tenant_id, job_no, vehicle_id, customer_id, complaint, status, odometer_km, delivered_at)
    values (ta, 1, va, ca, 'Service', 'delivered', 120000, now() - interval '7 months'),
           (ta, 2, va2, ca, 'Service', 'delivered', 50000, now() - interval '7 days'),
           (tb, 1, vb, cb, 'Service', 'delivered', 80000, now() - interval '8 months');
  insert into public.gr_service_plans(tenant_id, vehicle_id, every_months) values (tb, vb, 6);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  insert into public.gr_service_plans(vehicle_id, every_km, every_months) values (va, 5000, 6), (va2, 5000, 6);
  select count(*) into n from public.gr_service_due;
  r := r || 'A sees plans=' || n || ' (expect 2); ';
  begin insert into public.gr_service_plans(vehicle_id, every_months) values (vb, 3); ok := true; exception when others then ok := false; end;
  r := r || 'A plan on B car allowed=' || ok || ' (expect false); ';
  begin insert into public.gr_service_plans(vehicle_id) values (va2); ok := true; exception when others then ok := false; end;
  r := r || 'plan without interval allowed=' || ok || ' (expect false); ';
  select public.gr_queue_service_reminders(7) into n;
  r := r || 'A queued=' || n || ' (expect 1); ';
  select public.gr_queue_service_reminders(7) into n;
  r := r || 'A queued again=' || n || ' (expect 0); ';
  begin select count(*) into n from public.notifications; r := r || 'A reads notifications=' || n || '; ';
  exception when others then r := r || 'A reads notifications denied; '; end;

  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role','authenticated')::text, true);
  begin perform public.gr_queue_service_reminders(7); ok := true; exception when others then ok := false; end;
  r := r || 'staff queue allowed=' || ok || ' (expect false); ';
  update public.gr_service_plans set every_months = 1 where vehicle_id = va;
  get diagnostics n = row_count;
  r := r || 'staff update rows=' || n || ' (expect 0); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select count(*) into n from public.gr_service_due;
  r := r || 'B sees plans=' || n || ' (expect 1); ';
  select public.gr_queue_service_reminders(7) into n;
  r := r || 'B queued=' || n || ' (expect 1); ';

  perform set_config('role','postgres', true);
  select count(*) into n from public.notifications where tenant_id = ta and channel = 'sms' and body like '%3-A12345%';
  r := r || 'A sms rows for due car=' || n || ' (expect 1); ';
  select count(*) into n from public.notifications where tenant_id = ta and body like '%3-A99999%';
  r := r || 'A sms rows for not-due car=' || n || ' (expect 0); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin select count(*) into n from public.gr_service_due; r := r || 'anon rows=' || n || '; '; exception when others then r := r || 'anon denied; '; end;
  begin perform public.gr_queue_service_reminders(7); ok := true; exception when others then ok := false; end;
  r := r || 'anon queue allowed=' || ok || ' (expect false); ';

  raise exception 'RESULTS: %', r;
end $$;
