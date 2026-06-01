-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 17 Finance Notification Fix
-- Date    : 2026-06-01
-- Build   : v133
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   Idempotent (safe to re-run).
--
-- ROOT CAUSES FIXED:
--
-- ROOT CAUSE 1 — notifications_type_check constraint:
--   'finance' and 'moderasi' types were not confirmed in the CHECK constraint.
--   Any INSERT with type='finance' would fail with error 23514 (check violation).
--   This blocked ALL finance notifications regardless of who triggered them.
--   Fix: Drop and recreate constraint with complete allowed-type list.
--
-- ROOT CAUSE 2 — RLS "notifications: mod insert":
--   Phase15 restricted INSERT to get_my_role() IN ('owner','ketua','admin').
--   Bendahara (who is isFinance()) could not INSERT notifications.
--   Any finance action by bendahara silently failed with error 42501 (RLS).
--   Fix: Add 'bendahara' to the INSERT policy.
--
-- SECURITY:
--   Bendahara is a trusted finance role. Allowing them to INSERT notifications
--   enables finance workflow notifications when bendahara manages transactions.
--   The policy still blocks anggota and all unauthenticated users.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Fix notifications_type_check — add 'finance' and 'moderasi' ────────
DO $$
BEGIN
  -- Drop existing constraint (may or may not have 'finance'/'moderasi')
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'notifications'
      AND constraint_name = 'notifications_type_check'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
    RAISE NOTICE 'notifications_type_check dropped';
  END IF;

  -- Recreate with full allowed-type list
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
      'content_deleted',
      'content_approved',
      'content_rejected',
      'role_changed',
      'gallery_approved',
      'gallery_rejected',
      'finance',
      'moderasi'
    ]::text[]));

  RAISE NOTICE 'notifications_type_check recreated — finance and moderasi included';
END
$$;

-- ── 2. Update "notifications: mod insert" — add bendahara ─────────────────
DROP POLICY IF EXISTS "notifications: mod insert" ON public.notifications;

CREATE POLICY "notifications: mod insert"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
  get_my_role() IN ('owner', 'ketua', 'admin', 'bendahara')
);

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Confirm constraint has 'finance':
-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_schema = 'public'
--   AND constraint_name = 'notifications_type_check';
-- Expected: includes 'finance' and 'moderasi'

-- 2. Confirm RLS policy includes bendahara:
-- SELECT policyname, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'notifications';
-- Expected: "notifications: mod insert" with_check includes 'bendahara'

-- 3. Test — insert as bendahara user:
-- INSERT INTO public.notifications(user_id, type, title, message, is_read)
-- VALUES ('<target_user_id>', 'finance', 'Test', 'Test message', false);
-- Expected: success (no error)
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 17
-- ═══════════════════════════════════════════════════════════════════════════
