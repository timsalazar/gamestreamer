-- Migration: add balls, strikes, inning_scores
-- Run this in Supabase SQL Editor if you already ran schema.sql

alter table games
  add column if not exists balls         int  not null default 0,
  add column if not exists strikes       int  not null default 0,
  add column if not exists inning_scores jsonb not null default '{"top":[],"bottom":[]}';
