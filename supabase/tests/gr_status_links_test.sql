-- Courtesy status link test. Run with Supabase `execute_sql`.
-- Builds two garages, checks who can create, see, switch off and read links, then
-- RAISES an exception so everything rolls back. The message is the result line.

do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); us uuid := gen_random_uuid();
  ta uuid; tb uuid; ca uuid; cb uuid; va uuid; vb uuid;
  ja1 uuid; ja2 uuid; ja3 uuid; jb uuid;
  tok text; tok3 text; n int; s text; r text := ''; ok boolean;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','gr-link-a@test.invalid'),
    (ub,'authenticated','authenticated','gr-link-b@test.invalid'),
    (us,'authenticated','authenticated','gr-link-s@test.invalid');
  insert into public.tenants(name, vertical, phone) values ('Link Test A','garage','0911000000') returning id into ta;
  insert into public.tenants(name, vertical) values ('Link Test B','garage') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values
    (ua, ta, 'A owner','owner'), (ub, tb, 'B owner','owner'), (us, ta, 'A staff','staff');
  insert into public.customers(tenant_id, name) values (ta,'Cust A') returning id into ca;
  insert into public.customers(tenant_id, name) values (tb,'Cust B') returning id into cb;
  insert into public.gr_vehicles(tenant_id, plate, customer_id, make, model) values (ta,'3-A12345',ca,'Toyota','Vitz') returning id into va;
  insert into public.gr_vehicles(tenant_id, plate, customer_id) values (tb,'OR-B54321',cb) returning id into vb;
  insert into public.gr_job_cards(tenant_id, job_no, vehicle_id, customer_id, complaint, status)
    values (ta, 1, va, ca, 'Brakes squeak', 'waiting_parts') returning id into ja1;
  insert into public.gr_job_cards(tenant_id, job_no, vehicle_id, customer_id, complaint) values (ta, 2, va, ca, 'Oil change') returning id into ja2;
  insert into public.gr_job_cards(tenant_id, job_no, vehicle_id, customer_id, complaint, status, delivered_at)
    values (ta, 3, va, ca, 'Old job', 'delivered', now() - interval '20 days') returning id into ja3;
  insert into public.gr_job_cards(tenant_id, job_no, vehicle_id, customer_id, complaint) values (tb, 1, vb, cb, 'Clutch') returning id into jb;
  insert into public.gr_status_links(tenant_id, job_id) values (ta, ja3) returning token into tok3;

  -- garage A owner
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  insert into public.gr_status_links(job_id) values (ja1) returning token into tok;
  select plate || '|' || garage_name || '|' || coalesce(vehicle_label,'') into s from public.gr_status_links where token = tok;
  r := r || 'A link copied=' || s || ' (expect 3-A12345|Link Test A|Toyota Vitz); ';
  r := r || 'token ok=' || (tok ~ '^[0-9a-f]{48}$') || ' (expect true); ';
  begin insert into public.gr_status_links(job_id) values (ja1); ok := true; exception when others then ok := false; end;
  r := r || 'second live link allowed=' || ok || ' (expect false); ';
  begin insert into public.gr_status_links(job_id) values (jb); ok := true; exception when others then ok := false; end;
  r := r || 'A link on B job allowed=' || ok || ' (expect false); ';
  begin insert into public.gr_status_links(job_id, token) values (ja2, repeat('a',48)); ok := true; exception when others then ok := false; end;
  r := r || 'A picks own token allowed=' || ok || ' (expect false); ';

  -- garage B owner
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select count(*) into n from public.gr_status_links;  r := r || 'B sees links=' || n || ' (expect 0); ';
  update public.gr_status_links set revoked_at = now() where token = tok; get diagnostics n = row_count;
  r := r || 'B switches off A link rows=' || n || ' (expect 0); ';

  -- garage A staff
  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role','authenticated')::text, true);
  select count(*) into n from public.gr_status_links;  r := r || 'A staff sees links=' || n || ' (expect 2); ';
  begin update public.gr_status_links set revoked_at = null where token = tok; get diagnostics n = row_count; exception when others then n := -1; end;
  r := r || 'staff un-revoke rows=' || n || ' (expect 0 or -1); ';

  -- anon, the customer's phone
  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.headers', '{}', true);
  select count(*) into n from public.gr_status_links;  r := r || 'anon no token links=' || n || ' (expect 0); ';
  select count(*) into n from public.gr_job_cards;     r := r || 'anon no token jobs=' || n || ' (expect 0); ';
  perform set_config('request.headers', json_build_object('x-status-token', repeat('0',48))::text, true);
  select count(*) into n from public.gr_job_cards;     r := r || 'anon wrong token jobs=' || n || ' (expect 0); ';
  perform set_config('request.headers', json_build_object('x-status-token', tok)::text, true);
  select count(*) into n from public.gr_status_links;  r := r || 'anon token links=' || n || ' (expect 1); ';
  select string_agg(job_no || ':' || status, ',') into s from public.gr_job_cards;
  r := r || 'anon token jobs=' || coalesce(s,'none') || ' (expect 1:waiting_parts); ';
  begin select count(complaint) into n from public.gr_job_cards; ok := true; exception when others then ok := false; end;
  r := r || 'anon reads complaint=' || ok || ' (expect false); ';
  begin select count(token) into n from public.gr_status_links; ok := true; exception when others then ok := false; end;
  r := r || 'anon reads token column=' || ok || ' (expect false); ';
  begin select count(*) into n from public.gr_vehicles; exception when others then n := -1; end;
  r := r || 'anon vehicles=' || n || ' (expect 0 or -1); ';
  begin insert into public.gr_status_links(job_id) values (ja2); ok := true; exception when others then ok := false; end;
  r := r || 'anon insert link=' || ok || ' (expect false); ';
  perform set_config('request.headers', json_build_object('x-status-token', tok3)::text, true);
  select count(*) into n from public.gr_job_cards;     r := r || 'anon job delivered 20d ago=' || n || ' (expect 0); ';

  -- switched off: back as A staff, then anon again
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role','authenticated')::text, true);
  update public.gr_status_links set revoked_at = now() where token = tok; get diagnostics n = row_count;
  r := r || 'staff switches off rows=' || n || ' (expect 1); ';
  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.headers', json_build_object('x-status-token', tok)::text, true);
  select count(*) into n from public.gr_job_cards;     r := r || 'anon after switch-off jobs=' || n || ' (expect 0); ';

  raise exception 'GR_STATUS_LINK_TEST (rolled back): %', r;
end $$;
