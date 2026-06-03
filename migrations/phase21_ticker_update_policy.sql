-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 21: Ticker RLS UPDATE policy + SELECT hardening
-- Date    : 2026-06-04
-- Build   : v136
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   Idempotent (safe to re-run).
--
-- ROOT CAUSE (Phase 24 Audit finding):
--   phase1_rls_policies.sql defined three RLS policies for the tickers table:
--     - SELECT  (public read, USING true)
--     - INSERT  (mod only)
--     - DELETE  (mod only)
--   Phase 19 (phase19_ticker_sponsor_soft_delete.sql) added deleted_at /
--   deleted_by columns and the restore_soft_deleted() SECURITY DEFINER RPC,
--   but DID NOT add an UPDATE policy.
--
--   Result: deleteTicker() called db.from('tickers').update({deleted_at,...})
--   which was silently blocked by RLS (no UPDATE policy = deny). PostgREST
--   returned { data:[], error:null } — 0 rows affected, no error object.
--   The app code checked `if (error)` → false → continued as if success.
--   The DB row was never changed, so loadTicker() re-fetched the ticker
--   (deleted_at still NULL) and re-rendered it in the ticker bar.
--
-- FIX A — Add missing UPDATE policy:
--   Allows owner/ketua/admin to UPDATE rows (required for soft-delete).
--
-- FIX B — Harden SELECT policy (defense-in-depth):
--   Original "tickers: public read" used USING (true) which exposed
--   soft-deleted rows via the Supabase API to anyone without a filter.
--   Changed to USING (deleted_at IS NULL) so soft-deleted rows are
--   invisible at the RLS layer, not just filtered at the app layer.
--
-- NOTE: restore_soft_deleted() is SECURITY DEFINER and bypasses RLS,
--   so it is unaffected by the new SELECT policy.
--
-- STATUS: DEPLOYED TO PRODUCTION on 2026-06-04 (confirmed via Supabase
--   Dashboard SQL Editor — "Success. No rows returned" on both statements).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- FIX A: Add UPDATE policy for tickers (was missing — root cause of bug)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tickers: mod update" ON public.tickers;
CREATE POLICY "tickers: mod update"
ON public.tickers FOR UPDATE
TO authenticated
USING  (get_my_role() IN ('owner','ketua','admin'))
WITH CHECK (get_my_role() IN ('owner','ketua','admin'));

-- ─────────────────────────────────────────────────────────────────────────
-- FIX B: Restrict SELECT to non-deleted rows at RLS layer
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tickers: public read" ON public.tickers;
CREATE POLICY "tickers: public read"
ON public.tickers FOR SELECT
USING (deleted_at IS NULL);

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'tickers';
-- Expected: 4 rows — public read (SELECT), mod insert (INSERT),
--           mod update (UPDATE), mod delete (DELETE)
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 21
-- ═══════════════════════════════════════════════════════════════════════════
