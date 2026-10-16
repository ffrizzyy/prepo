-- Row Level Security keyed on workspace_id (PREPO.md §1.3, §9.3 A01).
-- Every application session must scope itself first:
--   select set_config('app.workspace_id', '<uuid>', true);
-- Unset means NULL, the predicate is false, and the default is deny.
-- A custom GUC that has been set and then reset reads back as '' rather than
-- NULL, so both cases are folded into NULL before the cast.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'memberships', 'invitations', 'meetings', 'audio_assets',
      'transcript_segments', 'action_items', 'tickets', 'ticket_events',
      'comments', 'followups', 'notifications', 'integrations', 'api_keys',
      'share_links', 'saved_views', 'ai_runs', 'stt_runs', 'audit_logs'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists ws_isolation on %I', t);
    execute format(
      'create policy ws_isolation on %I '
      || 'using (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid) '
      || 'with check (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  end loop;
end
$$;

-- The workspace row itself is only visible when it is the scoped workspace.
alter table workspaces enable row level security;
alter table workspaces force row level security;
drop policy if exists ws_isolation on workspaces;
create policy ws_isolation on workspaces
  using (id = nullif(current_setting('app.workspace_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.workspace_id', true), '')::uuid);

-- RLS never applies to a superuser, and only applies to a table's owner when the
-- policy is forced. Both PGlite's default role and a Neon owner role are
-- privileged, so the application runs as this dedicated non-owner role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'prepo_app') then
    create role prepo_app nologin;
  end if;
end
$$;

do $$
begin
  execute format('grant prepo_app to %I', current_user);
exception when others then
  raise notice 'could not grant prepo_app to %: %', current_user, sqlerrm;
end
$$;

grant usage on schema public to prepo_app;
grant select, insert, update, delete on all tables in schema public to prepo_app;

-- Bootstrap problem: a session knows its slug before it knows its workspace id,
-- and the workspaces table is policy-protected. These SECURITY DEFINER helpers
-- are the only way across that gap, and they return nothing but an id.
create or replace function resolve_workspace_id(p_slug text)
returns uuid
language sql
security definer
stable
as $$
  select id from workspaces where slug = p_slug
$$;

create or replace function list_workspaces_for_user(p_user_id uuid)
returns table (id uuid, slug text, name text, role membership_role)
language sql
security definer
stable
as $$
  select w.id, w.slug, w.name, m.role
  from workspaces w
  join memberships m on m.workspace_id = w.id
  where m.user_id = p_user_id
  order by w.created_at
$$;

grant execute on function resolve_workspace_id(text) to prepo_app;
grant execute on function list_workspaces_for_user(uuid) to prepo_app;
