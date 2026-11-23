-- SECURITY: before adding the first business table, follow the README rule ("Sécurité /
-- déploiement"): dedicated least-privilege DB role for the API limited to the `switchyard`
-- schema, RLS enabled with a `user_id` policy, and every query filtered by `request.user.id`.
--
-- Switchyard initial schema.
--
-- App tables live in the private `switchyard` schema. It is NOT exposed through PostgREST
-- (the Supabase Data API): the Switchyard API reaches it directly over a Postgres connection,
-- authenticating the user itself (verified Supabase access token) and filtering by user id.
--
-- RULE: any table ever created in the `public` schema is reachable through the Data API with the
-- publishable key, so it MUST enable row level security (`alter table ... enable row level
-- security;`) and ship explicit policies in the same migration.

create schema if not exists switchyard;

-- Nobody reaches this schema through the Data API roles.
revoke all on schema switchyard from public, anon, authenticated;
alter default privileges in schema switchyard revoke all on tables from anon, authenticated;
alter default privileges in schema switchyard revoke all on sequences from anon, authenticated;
alter default privileges in schema switchyard revoke all on functions from anon, authenticated;

-- The API connects as `postgres`; `service_role` is kept for server-side maintenance tasks only.
grant usage on schema switchyard to postgres, service_role;
grant all on all tables in schema switchyard to postgres, service_role;
alter default privileges in schema switchyard grant all on tables to postgres, service_role;
alter default privileges in schema switchyard grant all on sequences to postgres, service_role;

comment on schema switchyard is
  'Private application schema, not exposed through PostgREST. Only reached by the Switchyard API.';
