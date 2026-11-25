-- Switchyard check runner: scheduling column and system-level functions.
--
-- The scheduler has to find due connections of ALL users, which RLS (by design) forbids for
-- `switchyard_api`. The two functions below are the only cross-user code paths. They are
-- SECURITY DEFINER on purpose (they run as their owner, `postgres`, and so bypass RLS), but they
-- only ever return ids / a count, take bounded arguments, and use an empty search_path with fully
-- qualified names.
--
-- HOSTED SUPABASE REQUIREMENT: the function owner must bypass RLS (superuser or BYPASSRLS),
-- because the tables use FORCE ROW LEVEL SECURITY. Supabase's `postgres` role (local CLI and
-- hosted) is not a superuser but has BYPASSRLS; check with
--   select rolsuper, rolbypassrls from pg_roles where rolname = 'postgres';
-- Otherwise the functions would silently see zero rows, so both raise an error instead.
--
-- Only the dedicated `switchyard_scheduler` role (no table privileges) can execute them:
-- `switchyard_api`, which serves user requests, cannot.

-- 1. Scheduling column ----------------------------------------------------------------------
alter table switchyard.connections
  add column next_check_at timestamptz not null default now();
create index connections_next_check_at_idx on switchyard.connections (next_check_at);

-- Claiming a connection updates next_check_at: only user-visible changes must bump updated_at.
drop trigger connections_touch_updated_at on switchyard.connections;
create trigger connections_touch_updated_at
  before update of project_id, integration_id, label, config, secrets on switchyard.connections
  for each row execute function switchyard.touch_updated_at();

-- Fails loudly when the definer cannot bypass RLS (it would otherwise see zero rows).
create function switchyard.assert_definer_bypasses_rls()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles r
    where r.rolname = current_user and (r.rolsuper or r.rolbypassrls)
  ) then
    raise exception 'switchyard: % must bypass RLS to own the scheduler functions', current_user;
  end if;
end
$$;
revoke all on function switchyard.assert_definer_bypasses_rls() from public;

-- 2. Claim due connections ------------------------------------------------------------------
create function switchyard.claim_due_connections(
  p_limit integer,
  p_interval_seconds integer,
  p_per_user integer
)
returns table (user_id uuid, project_id uuid, connection_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform switchyard.assert_definer_bypasses_rls();
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'p_limit must be between 1 and 100';
  end if;
  if p_interval_seconds is null or p_interval_seconds not between 60 and 86400 then
    raise exception 'p_interval_seconds must be between 60 and 86400';
  end if;
  if p_per_user is null or p_per_user not between 1 and 100 then
    raise exception 'p_per_user must be between 1 and 100';
  end if;

  -- Fairness: at most p_per_user connections per user per call, so one user with many due
  -- connections cannot starve the others. `picked` chooses candidate ids; `due` then locks those
  -- rows (SKIP LOCKED, re-checking the due condition on the locked version) and the update runs
  -- in the same statement: concurrent callers never claim the same row (they may claim fewer).
  return query
  with ranked as (
    select c.id, c.next_check_at,
      pg_catalog.row_number() over (partition by c.user_id order by c.next_check_at, c.id) as rn
    from switchyard.connections c
    where c.next_check_at <= pg_catalog.now()
  ),
  picked as (
    select r.id
    from ranked r
    where r.rn <= p_per_user
    order by r.next_check_at, r.id
    limit p_limit
  ),
  due as (
    select c.id
    from switchyard.connections c
    where c.id in (select p.id from picked p)
      and c.next_check_at <= pg_catalog.now()
    order by c.next_check_at, c.id
    for update skip locked
  )
  update switchyard.connections c
  set next_check_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_interval_seconds)
  from due
  where c.id = due.id
  returning c.user_id, c.project_id, c.id;
end
$$;

-- 3. Prune old results ----------------------------------------------------------------------
create function switchyard.prune_check_results(p_older_than_days integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted integer;
begin
  perform switchyard.assert_definer_bypasses_rls();
  if p_older_than_days is null or p_older_than_days not between 1 and 3650 then
    raise exception 'p_older_than_days must be between 1 and 3650';
  end if;

  delete from switchyard.check_results r
  where r.checked_at < pg_catalog.now() - pg_catalog.make_interval(days => p_older_than_days);
  get diagnostics deleted = row_count;
  return deleted;
end
$$;

-- 4. Scheduler role and privileges ----------------------------------------------------------
-- NOLOGIN, no table privileges: it can only execute the two functions below (which run as their
-- owner). Reached through `set local role`, like switchyard_api.
do $$
begin
  if not exists (select from pg_roles where rolname = 'switchyard_scheduler') then
    create role switchyard_scheduler nologin noinherit nobypassrls;
  end if;
end
$$;
grant switchyard_scheduler to postgres;
grant usage on schema switchyard to switchyard_scheduler;

revoke all on function switchyard.claim_due_connections(integer, integer, integer)
  from public, anon, authenticated, switchyard_api;
revoke all on function switchyard.prune_check_results(integer)
  from public, anon, authenticated, switchyard_api;
grant execute on function switchyard.claim_due_connections(integer, integer, integer)
  to switchyard_scheduler;
grant execute on function switchyard.prune_check_results(integer) to switchyard_scheduler;

comment on function switchyard.claim_due_connections(integer, integer, integer) is
  'SECURITY DEFINER (bypasses RLS on purpose): claims due connections of all users (at most p_per_user each), returns ids only.';
comment on function switchyard.prune_check_results(integer) is
  'SECURITY DEFINER (bypasses RLS on purpose): deletes check results older than N days.';

-- 5. Defense in depth on check_results -------------------------------------------------------
alter table switchyard.check_results
  add constraint check_results_details_size check (details is null or pg_column_size(details) <= 16384);
create index check_results_checked_at_idx on switchyard.check_results (checked_at);
