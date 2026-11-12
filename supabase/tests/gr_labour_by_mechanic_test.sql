-- Labour-by-mechanic report test: per-mechanic totals, reversed lines excluded, tenant isolation, anon denied.
-- Rolls back via the final RAISE. Result on 2026-11-12: all four checks matched.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ta uuid; tb uuid; ma uuid; mb uuid; ja uuid; jb uuid; la uuid; r text := ''; ok boolean; rec record; today date := (now() at time zone 'Africa/Addis_Ababa')::date;
begin
  insert into auth.users(id, aud, role, email) values (ua,'authenticated','authenticated','grm-a@test.invalid'),(ub,'authenticated','authenticated','grm-b@test.invalid');
  insert into public.tenants(name, vertical) values ('GRM A','garage') returning id into ta;
  insert into public.tenants(name, vertical) values ('GRM B','garage') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (ua, ta, 'A owner','owner'), (ub, tb, 'B owner','owner');
  insert into public.gr_mechanics(tenant_id,name) values (ta,'Mech A') returning id into ma;
  insert into public.gr_mechanics(tenant_id,name) values (tb,'Mech B') returning id into mb;
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  jb := public.gr_open_job('3-BB 22222','Oil change', p_customer_name=>'Cust B');
  perform public.gr_add_labour(jb, 'Change oil', 1000, mb);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  ja := public.gr_open_job('3-AA 12345','Brakes', p_customer_name=>'Cust A');
  perform public.gr_add_labour(ja, 'Fit pads', 300, ma);
  perform public.gr_add_labour(ja, 'Bleed brakes', 200, ma);
  la := public.gr_add_labour(ja, 'Wrong line', 999, ma);
  perform public.gr_reverse_labour(la);
  perform public.gr_add_labour(ja, 'Wash', 50);
  select count(*)::int n into rec from public.gr_labour_by_mechanic(today, today); r := r || 'A rows=' || rec.n || ' (expect 2); ';
  select * into rec from public.gr_labour_by_mechanic(today, today) limit 1;
  r := r || 'A top=' || rec.mechanic_name || ' jobs=' || rec.jobs || ' labour=' || rec.labour || ' (expect Mech A,1,500, reversal excluded, B not seen); ';
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select * into rec from public.gr_labour_by_mechanic(today, today) limit 1;
  r := r || 'B top=' || rec.mechanic_name || ' labour=' || rec.labour || ' (expect Mech B,1000); ';
  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  begin perform * from public.gr_labour_by_mechanic(today, today); ok := true; exception when others then ok := false; end;
  r := r || 'anon=' || ok || ' (expect false); ';
  raise exception 'RESULT %', r;
end $$;
