-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 8 Patch Bundle
-- Date    : 2026-05-28
-- Build   : v117
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   All statements are idempotent (safe to re-run).
--
-- COVERS:
--   Task 1 — Add user_id to tickers table (BUG 1: ticker ownership tracking)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 1 — ADD user_id TO tickers
--
-- Required for: deleteTicker notification (send notif to ticker owner),
-- and addTicker tracking (who created each ticker).
-- Nullable so existing rows are not broken.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tickers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Index for querying tickers by owner
CREATE INDEX IF NOT EXISTS idx_tickers_user_id
ON public.tickers(user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION (run after applying)
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'tickers'
-- ORDER BY ordinal_position;
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 8
-- ═══════════════════════════════════════════════════════════════════════════
