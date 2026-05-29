-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 12 Bendahara Direct Finance History Access
-- Date    : 2026-05-29
-- Build   : v125
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   Statement is idempotent (safe to re-run).
--
-- WHY:
--   get_finance_history / get_finance_audit RPCs (phase10/11) caused
--   persistent 42702 errors because PostgREST schema cache did not
--   reload reliably on this Supabase instance.
--   Fix: replace RPC approach with direct table queries from JS.
--   owner/ketua already have full SELECT on moderation_history via the
--   existing "leader read" policy. This policy extends bendahara access
--   to finance rows only (table_name = 'transactions').
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "moderation_history: bendahara finance read" ON public.moderation_history;

CREATE POLICY "moderation_history: bendahara finance read"
ON public.moderation_history FOR SELECT
TO authenticated
USING (
  get_my_role() = 'bendahara'
  AND table_name = 'transactions'
);

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT policyname, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'moderation_history';
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 12
-- ═══════════════════════════════════════════════════════════════════════════
