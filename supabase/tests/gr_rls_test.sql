-- Cross-tenant RLS and workflow test for Galmee Garage. Run with Supabase `execute_sql`.
-- Everything rolls back: the final RAISE carries the result line. Compare each value with its "expect".
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ta uuid; tb uuid; ia uuid; ib uuid; ma uuid; mb uuid; ja uuid; jb uuid; jc uuid; pa uuid; la uuid; n int; r text := ''; ok boolean; err text; v numeric; jr record;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','gr-a@test.invalid'),(ub,'authenticated','authenticated','gr-b@test.invalid'),(uc,'authenticated','authenticated','gr-c@test.invalid');
  insert into public.tenants(name, vertical) values ('GR A','garage') returning id into ta;
  insert into public.tenants(name, vertical) values ('GR B','garage') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (ua, ta, 'A owner','owner'), (ub, tb, 'B owner','owner'), (uc, ta, 'A desk','staff');
  insert into public.items(tenant_id,name_en,unit,price,cost) values (ta,'Brake pad','pc',100,60) returning id into ia;
  insert into public.items(tenant_id,name_en,unit,price,cost) values (tb,'Oil filter','pc',50,30) returning id into ib;
  insert into public.stock_batches(tenant_id,item_id,qty,cost) values (ta,ia,5,60),(tb,ib,5,30);
  insert into public.gr_mechanics(tenant_id,name) values (ta,'Mech A') returning id into ma;
  insert into public.gr_mechanics(tenant_id,name) values (tb,'Mech B') returning id into mb;

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  jb := public.gr_open_job('3-BB 22222','Oil change', p_customer_name=>'Cust B', p_customer_phone=>'0911000002');

  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  ja := public.gr_open_job('3-aa 12345','Brakes squeal', p_customer_name=>'Cust A', p_customer_phone=>'0911000001', p_mechanic=>ma, p_client_ref=>'22222222-2222-2222-2222-222222222222');
  r := r || 'idempotent=' || (public.gr_open_job('3-aa 12345','Brakes squeal', p_customer_name=>'Cust A', p_client_ref=>'22222222-2222-2222-2222-222222222222') = ja) || ' (expect true); ';
  begin perform public.gr_open_job('3 AA 12345','Again'); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'second open job=' || ok || ' err=' || err || ' (expect false, vehicle_has_open_job, plate key matches); ';
  pa := public.gr_add_part(ja, ia, 2);
  select qty into v from public.stock_batches where item_id=ia; r := r || 'stock=' || v || ' (expect 3); ';
  begin perform public.gr_add_part(ja, ia, 1, 1); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'staff price override=' || ok || ' err=' || err || ' (expect false); ';
  begin perform public.gr_add_part(ja, ia, 50); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'too many parts=' || ok || ' err=' || err || ' (expect false, insufficient_stock); ';
  select qty into v from public.stock_batches where item_id=ia; r := r || 'stock after failure=' || v || ' (expect 3); ';
  la := public.gr_add_labour(ja, 'Fit pads', 300);
  select * into jr from public.gr_job_cards where id=ja;
  r := r || 'totals parts=' || jr.parts_total || ' labour=' || jr.labour_total || ' total=' || jr.total || ' bal=' || jr.balance || ' no=' || jr.job_no || ' (expect 200,300,500,500,1); ';
  perform public.gr_reverse_labour(la); select balance into v from public.gr_job_cards where id=ja; r := r || 'bal after labour reversal=' || v || ' (expect 200); ';
  la := public.gr_add_labour(ja, 'Fit pads', 300);
  perform public.gr_reverse_part(pa); select qty into v from public.stock_batches where item_id=ia; r := r || 'stock after part reversal=' || v || ' (expect 5); ';
  begin perform public.gr_reverse_part(pa); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'double reversal=' || ok || ' err=' || err || ' (expect false, already_reversed); ';
  pa := public.gr_add_part(ja, ia, 2);
  begin perform public.gr_pay_job(ja, 501, 'cash'); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'overpay=' || ok || ' err=' || err || ' (expect false, overpayment); ';
  perform public.gr_pay_job(ja, 100, 'cash', null, '33333333-3333-3333-3333-333333333333');
  perform public.gr_pay_job(ja, 100, 'cash', null, '33333333-3333-3333-3333-333333333333');
  select paid_total into v from public.gr_job_cards where id=ja; r := r || 'paid idempotent=' || v || ' (expect 100); ';
  perform public.gr_set_status(ja, 'ready');
  select count(*) into n from public.notifications where body like '%ዝግጁ%' and to_addr='0911000001'; r := r || 'sms queued=' || n || ' (expect 1); ';
  begin perform public.gr_set_status(ja, 'delivered'); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'staff credit delivery=' || ok || ' err=' || err || ' (expect false, balance_due); ';
  begin insert into public.gr_job_cards(tenant_id,job_no,vehicle_id,customer_id,complaint) values (ta,99,(select vehicle_id from public.gr_job_cards where id=ja),(select customer_id from public.gr_job_cards where id=ja),'xx'); ok := true; exception when others then ok := false; end;
  r := r || 'staff direct job insert=' || ok || ' (expect false); ';
  begin update public.gr_job_cards set paid_total=500 where id=ja; get diagnostics n = row_count; exception when others then n := -1; end; r := r || 'staff direct job update rows=' || n || ' (expect 0 or -1); ';
  begin insert into public.gr_mechanics(name) values ('Sneaky'); ok := true; exception when others then ok := false; end;
  r := r || 'staff adds mechanic=' || ok || ' (expect false); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  select count(*) into n from public.gr_job_cards;            r := r || 'A sees jobs=' || n || ' (expect 1); ';
  select count(*) into n from public.gr_job_cards where id=jb; r := r || 'A sees B job=' || n || ' (expect 0); ';
  select count(*) into n from public.gr_vehicles;             r := r || 'A sees vehicles=' || n || ' (expect 1); ';
  select count(*) into n from public.gr_mechanics where id=mb; r := r || 'A sees B mechanic=' || n || ' (expect 0); ';
  begin perform public.gr_add_labour(jb,'Evil',10); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'A labour on B job=' || ok || ' err=' || err || ' (expect false, job_not_found); ';
  begin perform public.gr_add_part(ja, ib, 1); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'A uses B item=' || ok || ' err=' || err || ' (expect false, job_closed or item_not_found); ';
  begin perform public.gr_pay_job(jb, 1, 'cash'); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'A pays B job=' || ok || ' err=' || err || ' (expect false, job_not_found); ';
  begin perform public.gr_update_job(ja, mb, 'x', 10); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'A assigns B mechanic=' || ok || ' err=' || err || ' (expect false, mechanic_not_found); ';
  begin update public.gr_mechanics set name='x' where id=mb; get diagnostics n = row_count; exception when others then n := -1; end; r := r || 'A updates B mechanic rows=' || n || ' (expect 0 or -1); ';
  perform public.gr_set_status(ja, 'delivered', current_date + 30);
  select count(*) into n from public.credit_ledger where ref_id=ja and type='debt' and amount=400; r := r || 'debt posted=' || n || ' (expect 1); ';
  begin perform public.gr_add_labour(ja,'Late',10); ok := true; exception when others then ok := false; err := sqlerrm; end;
  r := r || 'labour after delivery=' || ok || ' err=' || err || ' (expect false, job_closed); ';
  perform public.gr_pay_job(ja, 400, 'telebirr');
  select count(*) into n from public.credit_ledger where ref_id=ja and type='repayment' and amount=400; r := r || 'repayment=' || n || ' (expect 1); ';
  select balance into v from public.gr_job_cards where id=ja; r := r || 'final bal=' || v || ' (expect 0); ';
  jc := public.gr_open_job('3-AA 12345','Next visit');
  r := r || 'reopen after delivery ok; ';
  perform public.gr_set_status(jc,'cancelled'); select status into err from public.gr_job_cards where id=jc; r := r || 'cancelled=' || err || ' (expect cancelled); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin select count(*) into n from public.gr_job_cards; exception when others then n := -1; end; r := r || 'anon jobs=' || n || ' (expect 0 or -1); ';
  begin select count(*) into n from public.gr_vehicles; exception when others then n := -1; end; r := r || 'anon vehicles=' || n || ' (expect 0 or -1); ';
  begin perform public.gr_open_job('X1234','xx',p_customer_name=>'Y'); ok := true; exception when others then ok := false; end; r := r || 'anon opens job=' || ok || ' (expect false); ';

  raise exception 'RESULT: %', r;
end $$;
