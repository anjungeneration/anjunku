-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 19 Ticker & Sponsor Soft Delete
-- Date    : 2026-06-02
-- Build   : v135
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   Idempotent (safe to re-run).
--
-- WHY:
--   tickers and sponsors previously used hard DELETE, permanently destroying
--   data and making audit/recovery impossible. This migration:
--     1. Adds deleted_at / deleted_by columns to both tables
--     2. Adds deleted_at IS NULL indexes for query performance
--     3. Extends restore_soft_deleted() to handle tickers and sponsors
--
-- DEPLOYMENT ORDER:
--   Run this SQL BEFORE deploying script.js v6.14 to production.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ADD SOFT-DELETE COLUMNS TO tickers
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickers' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.tickers ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    RAISE NOTICE 'tickers.deleted_at added';
  ELSE
    RAISE NOTICE 'tickers.deleted_at already exists — skipped';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickers' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE public.tickers ADD COLUMN deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;
    RAISE NOTICE 'tickers.deleted_by added';
  ELSE
    RAISE NOTICE 'tickers.deleted_by already exists — skipped';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. ADD SOFT-DELETE COLUMNS TO sponsors
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sponsors' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.sponsors ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    RAISE NOTICE 'sponsors.deleted_at added';
  ELSE
    RAISE NOTICE 'sponsors.deleted_at already exists — skipped';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sponsors' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE public.sponsors ADD COLUMN deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;
    RAISE NOTICE 'sponsors.deleted_by added';
  ELSE
    RAISE NOTICE 'sponsors.deleted_by already exists — skipped';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. INDEXES FOR SOFT-DELETE FILTER PERFORMANCE
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickers_deleted_at  ON public.tickers  (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sponsors_deleted_at ON public.sponsors (deleted_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. EXTEND restore_soft_deleted() TO HANDLE tickers AND sponsors
--    Adds tickers and sponsors to the allowlist; all other logic unchanged.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_soft_deleted(p_table TEXT, p_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table NOT IN ('news','products','gallery','transactions','tickers','sponsors') THEN
    RAISE EXCEPTION 'restore_soft_deleted: table not allowed: %', p_table;
  END IF;

  IF p_table = 'news' THEN
    UPDATE public.news        SET deleted_at = NULL, deleted_by = NULL WHERE id::text = p_id;
  ELSIF p_table = 'products' THEN
    UPDATE public.products    SET deleted_at = NULL, deleted_by = NULL WHERE id::text = p_id;
  ELSIF p_table = 'gallery' THEN
    UPDATE public.gallery     SET deleted_at = NULL, deleted_by = NULL WHERE id::text = p_id;
  ELSIF p_table = 'transactions' THEN
    UPDATE public.transactions SET deleted_at = NULL, deleted_by = NULL WHERE id::text = p_id;
  ELSIF p_table = 'tickers' THEN
    UPDATE public.tickers     SET deleted_at = NULL, deleted_by = NULL WHERE id::text = p_id;
  ELSIF p_table = 'sponsors' THEN
    UPDATE public.sponsors    SET deleted_at = NULL, deleted_by = NULL WHERE id::text = p_id;
  END IF;
END;
$$;

RAISE NOTICE 'restore_soft_deleted() extended — tickers, sponsors added';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='tickers' AND column_name IN ('deleted_at','deleted_by');
-- Expected: 2 rows

-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='sponsors' AND column_name IN ('deleted_at','deleted_by');
-- Expected: 2 rows
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 19 MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
