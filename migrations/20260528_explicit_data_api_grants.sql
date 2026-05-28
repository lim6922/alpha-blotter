-- Supabase Data API explicit grants.
-- Required for new Supabase projects from 2026-05-30 and for new public
-- tables in existing projects from 2026-10-30.

grant usage on schema public to authenticated;

grant select on table public.allowed_emails to authenticated;

grant select, insert, delete on table public.trades to authenticated;
grant select, insert, delete on table public.atm_records to authenticated;
grant select, insert, delete on table public.asset_master to authenticated;

grant select, insert, update on table public.capitals to authenticated;
grant select, insert, update on table public.blotter_meta to authenticated;

-- Needed if any exposed table uses serial/identity defaults.
grant usage, select on all sequences in schema public to authenticated;
