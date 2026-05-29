-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 16 Notifications ref_id Fix
-- Date    : 2026-05-29
-- Build   : v129
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   Idempotent (safe to re-run).
--
-- ROOT CAUSE:
--   notifications.ref_id column was UUID type. Ticker IDs are bigint (not UUID).
--   Calling _insertNotif(..., 'tickers', tickerId, ...) caused PostgreSQL to
--   attempt an implicit cast 'bigint_string'::UUID → type error → INSERT fails
--   silently (caught by JS catch block) → owner never receives the notification.
--   role_changed notifications worked because ref_id was NULL (no cast needed).
--   news/product notifications worked because their IDs are valid UUIDs.
--
-- FIX:
--   1. Change ref_id to TEXT — stores any table's ID regardless of type.
--      Existing UUID values are preserved as their string representations.
--   2. JS patch (v129): deleteTicker now passes null as refId (belt-and-suspenders
--      since ticker click in notification panel has no detail navigation anyway).
--
-- SECURITY:
--   ref_id has no FK constraint — it's a soft reference for frontend navigation.
--   Changing to TEXT does not weaken any security boundary.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Only alter if the column is currently UUID type ───────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'notifications'
      AND column_name  = 'ref_id'
      AND data_type    = 'uuid'
  ) THEN
    ALTER TABLE public.notifications
      ALTER COLUMN ref_id TYPE TEXT USING ref_id::TEXT;
    RAISE NOTICE 'notifications.ref_id changed from UUID to TEXT';
  ELSE
    RAISE NOTICE 'notifications.ref_id is already TEXT (or column not found) — no change needed';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'notifications'
--   AND column_name = 'ref_id';
-- Expected: data_type = 'text'
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 16
-- ═══════════════════════════════════════════════════════════════════════════
