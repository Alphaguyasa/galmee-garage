-- Daily garage report: jobs handed over, their parts and labour value, and money collected,
-- per Addis Ababa calendar day. Security invoker: row level security keeps it to the caller's garage.
create function public.gr_daily_report(p_from date, p_to date)
returns table (day date, jobs_delivered int, parts numeric, labour numeric, collected numeric)
language sql stable security invoker set search_path = public, private as $$
  with days as (select d::date as day from generate_series(p_from, least(p_to, p_from + 366), interval '1 day') d),
  delivered as (
    select (j.delivered_at at time zone 'Africa/Addis_Ababa')::date as day,
           count(*)::int as n, sum(j.parts_total) as parts, sum(j.labour_total) as labour
    from gr_job_cards j
    where j.status = 'delivered'
      and j.delivered_at >= (p_from::timestamp at time zone 'Africa/Addis_Ababa')
      and j.delivered_at < ((least(p_to, p_from + 366) + 1)::timestamp at time zone 'Africa/Addis_Ababa')
    group by 1
  ),
  paid as (
    select (p.created_at at time zone 'Africa/Addis_Ababa')::date as day, sum(p.amount) as amount
    from gr_job_payments p
    where p.created_at >= (p_from::timestamp at time zone 'Africa/Addis_Ababa')
      and p.created_at < ((least(p_to, p_from + 366) + 1)::timestamp at time zone 'Africa/Addis_Ababa')
    group by 1
  )
  select d.day, coalesce(x.n, 0), coalesce(x.parts, 0), coalesce(x.labour, 0), coalesce(y.amount, 0)
  from days d
  left join delivered x on x.day = d.day
  left join paid y on y.day = d.day
  order by d.day
$$;

revoke all on function public.gr_daily_report(date, date) from public, anon;
grant execute on function public.gr_daily_report(date, date) to authenticated;
