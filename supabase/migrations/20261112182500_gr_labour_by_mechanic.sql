-- Labour booked per mechanic over a date range (Addis Ababa days), reversed lines excluded.
-- Security invoker: row level security keeps it to the caller's garage.
create function public.gr_labour_by_mechanic(p_from date, p_to date)
returns table (mechanic_id uuid, mechanic_name text, jobs int, labour numeric)
language sql stable security invoker set search_path = public, private as $$
  select l.mechanic_id, m.name, count(distinct l.job_id)::int, sum(l.amount)
  from gr_job_labour l
  left join gr_mechanics m on m.id = l.mechanic_id
  where l.reversed_at is null
    and l.created_at >= (p_from::timestamp at time zone 'Africa/Addis_Ababa')
    and l.created_at < ((least(p_to, p_from + 366) + 1)::timestamp at time zone 'Africa/Addis_Ababa')
  group by l.mechanic_id, m.name
  order by sum(l.amount) desc
$$;

revoke all on function public.gr_labour_by_mechanic(date, date) from public, anon;
grant execute on function public.gr_labour_by_mechanic(date, date) to authenticated;
