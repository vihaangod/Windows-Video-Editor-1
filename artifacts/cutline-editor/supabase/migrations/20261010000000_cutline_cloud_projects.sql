-- Cutline project metadata and editable state. Actual audio/video blobs remain local.
create table if not exists public.cutline_projects (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cutline_projects_owner_updated_idx
  on public.cutline_projects (owner_id, updated_at desc);

create table if not exists public.cutline_project_state (
  project_id uuid primary key references public.cutline_projects (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint cutline_project_state_is_object check (jsonb_typeof(state) = 'object')
);

alter table public.cutline_projects enable row level security;
alter table public.cutline_project_state enable row level security;

drop policy if exists "Users can access their own Cutline projects"
  on public.cutline_projects;
create policy "Users can access their own Cutline projects"
  on public.cutline_projects
  for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users can access state for their own Cutline projects"
  on public.cutline_project_state;
create policy "Users can access state for their own Cutline projects"
  on public.cutline_project_state
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.cutline_projects as project
      where project.id = cutline_project_state.project_id
        and project.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.cutline_projects as project
      where project.id = cutline_project_state.project_id
        and project.owner_id = (select auth.uid())
    )
  );

revoke all on public.cutline_projects, public.cutline_project_state from anon, public;
grant select, insert, update, delete on public.cutline_projects, public.cutline_project_state to authenticated;

create or replace function public.save_cutline_project(
  p_project_id uuid,
  p_name text,
  p_state jsonb,
  p_expected_version bigint
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_version bigint;
  next_version bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to save a Cutline project.'
      using errcode = '42501';
  end if;

  if p_project_id is null
    or p_name is null
    or char_length(btrim(p_name)) not between 1 and 100
    or p_state is null
    or jsonb_typeof(p_state) <> 'object'
    or coalesce(jsonb_typeof(p_state -> 'project'), '') <> 'object'
    or coalesce(jsonb_typeof(p_state -> 'assets'), '') <> 'array'
    or coalesce(jsonb_typeof(p_state -> 'selection'), '') <> 'object'
    or coalesce(jsonb_typeof(p_state #> '{project,tracks}'), '') <> 'array'
    or coalesce(jsonb_typeof(p_state #> '{project,clips}'), '') <> 'array'
    or coalesce(p_state ->> 'schemaVersion', '') <> '1'
    or coalesce(p_state #>> '{project,id}', '') <> p_project_id::text
    or coalesce(p_state #>> '{project,name}', '') <> p_name then
    raise exception 'The Cutline project payload is invalid.'
      using errcode = '22023';
  end if;

  if p_expected_version is null then
    insert into public.cutline_projects (id, owner_id, name, version, updated_at)
    values (p_project_id, (select auth.uid()), btrim(p_name), 1, now());
    next_version := 1;
  else
    select project.version
      into current_version
      from public.cutline_projects as project
      where project.id = p_project_id
        and project.owner_id = (select auth.uid())
      for update;

    if current_version is null or current_version <> p_expected_version then
      raise exception 'The Cutline project changed in the cloud. Reload it before saving.'
        using errcode = '40001';
    end if;

    next_version := current_version + 1;
    update public.cutline_projects
      set name = btrim(p_name),
          version = next_version,
          updated_at = now()
      where id = p_project_id
        and owner_id = (select auth.uid());
  end if;

  insert into public.cutline_project_state (project_id, state, updated_at)
  values (p_project_id, p_state, now())
  on conflict (project_id) do update
    set state = excluded.state,
        updated_at = excluded.updated_at;

  return next_version;
end;
$$;

revoke all on function public.save_cutline_project(uuid, text, jsonb, bigint) from public, anon;
grant execute on function public.save_cutline_project(uuid, text, jsonb, bigint) to authenticated;
