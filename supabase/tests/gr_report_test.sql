-- Daily report test for Galmee Garage: totals, tenant isolation and anon denial. Rolls back via the final RAISE.
-- Result on 2026-11-12: all six checks matched.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ta uuid; tb uuid; ia uuid; ib uuid; ja uuid; jb uuid; r text := ''; ok boolean; err text; rec record; today date := (now() at time zone 'Africa/Addis_Ababa')::date;
begin
  insert into auth.users(id, aud, role, email) values (ua,'authenticated','authenticated','grr-a@test.invalid'),(ub,'authenticated','authenticated','grr-b@test.invalid');
  insert into public.tenants(name, vertical) values ('GRR A','garage') returning id into ta;
  insert into public.tenants(name, vertical) values ('GRR B','garage') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (ua, ta, 'A owner','owner'), (ub, tb, 'B owner','owner');
  insert into public.items(tenant_id,name_en,unit,price,cost) values (ta,'Brake pad','pc',100,60) returning id into ia;
  insert into public.items(tenant_id,name_en,unit,price,cost) values (tb,'Oil filter','pc',50,30) returning id into ib;
  insert into public.stock_batches(tenant_id,item_id,qty,cost) values (ta,ia,5,60),(tb,ib,5,30);
  perform set_config('role','authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  jb := public.gr_open_job('3-BB 22222','Oil change', p_customer_name=>'Cust B');
  perform public.gr_add_part(jb, ib, 1); perform public.gr_add_labour(jb, 'Change oil', 1000);
  perform public.gr_pay_job(jb, 1050, 'cash'); perform public.gr_set_status(jb, 'ready'); perform public.gr_set_status(jb, 'delivered');

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  ja := public.gr_open_job('3-AA 12345','Brakes', p_customer_name=>'Cust A');
  perform public.gr_add_part(ja, ia, 2); perform public.gr_add_labour(ja, 'Fit pads', 300);
  perform public.gr_pay_job(ja, 150, 'cash');
  select * into rec from public.gr_daily_report(today, today);
  r := r || 'A before delivery jobs=' || rec.jobs_delivered || ' parts=' || rec.parts || ' labour=' || rec.labour || ' collected=' || rec.collected || ' (expect 0,0,0,150); ';
  perform public.gr_set_status(ja, 'ready'); perform public.gr_set_status(ja, 'delivered', today + 7);
  select * into rec from public.gr_daily_report(today, today);
  r := r || 'A after delivery jobs=' || rec.jobs_delivered || ' parts=' || rec.parts || ' labour=' || rec.labour || ' collected=' || rec.collected || ' (expect 1,200,300,150, B''s job not counted); ';
  select count(*)::int as n into rec from public.gr_daily_report(today - 6, today);
  r := r || 'week rows=' || rec.n || ' (expect 7); ';
  select count(*)::int as n into rec from public.gr_daily_report(today - 1000, today);
  r := r || 'capped rows=' || rec.n || ' (expect 367); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select * into rec from public.gr_daily_report(today, today);
  r := r || 'B jobs=' || rec.jobs_delivered || ' labour=' || rec.labour || ' collected=' || rec.collected || ' (expect 1,1000,1050); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  begin perform * from public.gr_daily_report(today, today); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'anon=' || ok || ' (expect false, permission denied); ';
  raise exception 'RESULT %', r;
end $$;
