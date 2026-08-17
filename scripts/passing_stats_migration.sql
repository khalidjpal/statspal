-- Graded passing (serve-receive rating) for StatsPal live tracking.
--
-- Every receive logged in LiveGame is graded on the standard 0–3 passer scale:
--   3 = perfect pass   2 = good   1 = poor   0 = aced / no pass
--
-- `receives` keeps its existing meaning — the total number of receive attempts,
-- incremented once per rating press no matter which grade was pressed. The four
-- columns below are the breakdown of those receives by grade, so:
--
--   passing average = (3*pass_3 + 2*pass_2 + 1*pass_1) / (pass_3+pass_2+pass_1+pass_0)
--
-- A 0 counts as an attempt and drags the average down, which is correct.
--
-- Games tracked before this migration have receives > 0 with an all-zero
-- breakdown; the app shows "—" for their passing average rather than 0.00.
--
-- Idempotent: safe to re-run.

alter table player_game_stats add column if not exists pass_3 integer default 0;
alter table player_game_stats add column if not exists pass_2 integer default 0;
alter table player_game_stats add column if not exists pass_1 integer default 0;
alter table player_game_stats add column if not exists pass_0 integer default 0;

-- Backfill any nulls on existing rows so the client never sees null counters.
update player_game_stats set pass_3 = 0 where pass_3 is null;
update player_game_stats set pass_2 = 0 where pass_2 is null;
update player_game_stats set pass_1 = 0 where pass_1 is null;
update player_game_stats set pass_0 = 0 where pass_0 is null;

-- Verification — should list pass_3, pass_2, pass_1, pass_0 as integer.
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'player_game_stats' and column_name like 'pass_%'
--   order by column_name;
