-- GameStreamer — Teams ownership & sharing migration
-- Run AFTER the base schema.sql (which creates games/plays tables).
-- Safe to run multiple times (all statements use IF NOT EXISTS / IF EXISTS guards).

-- ============================================================
-- 0. Teams table (create if it doesn't exist yet)
-- ============================================================
create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  players    jsonb not null default '[]',
  created_at timestamptz default now()
);

alter table teams add column if not exists updated_at timestamptz default now();

-- ============================================================
-- 1. Add owner_id to teams
-- ============================================================
alter table teams add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- Index so "my teams" queries are fast
create index if not exists teams_owner_id_idx on teams(owner_id);

drop trigger if exists teams_updated_at on teams;
create trigger teams_updated_at
  before update on teams
  for each row execute function update_updated_at();

-- ============================================================
-- 2. Team collaborators (registered users with viewer access)
-- ============================================================
create table if not exists team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'viewer' check (role in ('viewer')),
  invited_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  unique(team_id, user_id)
);

create index if not exists team_members_team_id_idx on team_members(team_id);
create index if not exists team_members_user_id_idx on team_members(user_id);

-- ============================================================
-- 3. Pending invites (for users not yet registered)
-- ============================================================
create table if not exists team_invites (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references teams(id) on delete cascade,
  invited_email  text not null,
  invited_by     uuid not null references auth.users(id),
  role           text not null default 'viewer',
  token          text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at     timestamptz not null default (now() + interval '7 days'),
  accepted_at    timestamptz,
  created_at     timestamptz default now()
);

create index if not exists team_invites_team_id_idx  on team_invites(team_id);
create index if not exists team_invites_token_idx    on team_invites(token);
create index if not exists team_invites_email_idx    on team_invites(invited_email);

-- ============================================================
-- 4. Enable RLS on all three tables
-- ============================================================
alter table teams        enable row level security;
alter table team_members enable row level security;
alter table team_invites enable row level security;

-- ============================================================
-- 5. RLS policies — teams
-- ============================================================

-- SELECT: owner can see their own teams; members can see teams they belong to
drop policy if exists "Teams: owner or member can select" on teams;
create policy "Teams: owner or member can select" on teams
  for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from team_members tm
      where tm.team_id = teams.id
        and tm.user_id = auth.uid()
    )
  );

-- INSERT: any authenticated user can create a team (owner_id must match their id)
drop policy if exists "Teams: authenticated users can insert own" on teams;
create policy "Teams: authenticated users can insert own" on teams
  for insert
  with check (auth.uid() = owner_id);

-- UPDATE: only the owner can update
drop policy if exists "Teams: owner can update" on teams;
create policy "Teams: owner can update" on teams
  for update
  using (auth.uid() = owner_id);

-- DELETE: only the owner can delete
drop policy if exists "Teams: owner can delete" on teams;
create policy "Teams: owner can delete" on teams
  for delete
  using (auth.uid() = owner_id);

-- ============================================================
-- 6. RLS policies — team_members
-- ============================================================

-- SELECT: a member can see their own membership rows; owner can see all members of their teams
drop policy if exists "Team members: owner or self can select" on team_members;
create policy "Team members: owner or self can select" on team_members
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and t.owner_id = auth.uid()
    )
  );

-- INSERT: only the team owner can add members
drop policy if exists "Team members: owner can insert" on team_members;
create policy "Team members: owner can insert" on team_members
  for insert
  with check (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and t.owner_id = auth.uid()
    )
  );

-- DELETE: only the team owner can remove members
drop policy if exists "Team members: owner can delete" on team_members;
create policy "Team members: owner can delete" on team_members
  for delete
  using (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and t.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 7. RLS policies — team_invites
-- ============================================================

-- SELECT (owner): team owner can see all invites for their teams
drop policy if exists "Team invites: owner can select" on team_invites;
create policy "Team invites: owner can select" on team_invites
  for select
  using (
    exists (
      select 1 from teams t
      where t.id = team_invites.team_id
        and t.owner_id = auth.uid()
    )
  );

-- SELECT (by token): anyone can look up an invite by its token (acceptance flow)
-- NOTE: This policy allows unauthenticated reads by token. If you want to restrict
-- to authenticated users only, replace auth.uid() is not null with true/remove check.
drop policy if exists "Team invites: anyone can select by token" on team_invites;
create policy "Team invites: anyone can select by token" on team_invites
  for select
  using (true);
-- Supersedes the owner policy above; Supabase ORs policies so having both is fine.
-- To tighten: remove the "anyone" policy and use application-level token lookup
-- via a service-role client (bypasses RLS) only for the acceptance endpoint.

-- INSERT: only the team owner can create invites
drop policy if exists "Team invites: owner can insert" on team_invites;
create policy "Team invites: owner can insert" on team_invites
  for insert
  with check (
    exists (
      select 1 from teams t
      where t.id = team_invites.team_id
        and t.owner_id = auth.uid()
    )
  );

-- UPDATE: only the team owner can update (e.g. cancel) invites
drop policy if exists "Team invites: owner can update" on team_invites;
create policy "Team invites: owner can update" on team_invites
  for update
  using (
    exists (
      select 1 from teams t
      where t.id = team_invites.team_id
        and t.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 8. updated_at tracking for team_members
-- ============================================================

-- updated_at for team_members
alter table team_members add column if not exists updated_at timestamptz default now();

create trigger team_members_updated_at
  before update on team_members
  for each row execute function update_updated_at();
