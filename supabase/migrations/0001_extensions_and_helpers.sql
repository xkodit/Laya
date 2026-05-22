-- Extensions only. The is_admin() helper that used to live here was moved
-- to 0002 because its SQL body validates against profiles at create time.
create extension if not exists pgcrypto;
create extension if not exists vector;
