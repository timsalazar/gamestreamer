-- Create game_lineups table to store explicit lineups for each side of a game
create table game_lineups (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  side text not null check (side in ('home', 'away')),
  team_id uuid references teams(id),
  players jsonb default '[]'::jsonb,
  current_batter_index integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(game_id, side)
);

-- Create index for fast lookups by game_id
create index idx_game_lineups_game_id on game_lineups(game_id);
