-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 20: content_restored type + self-notification insert policy
-- Date    : 2026-06-03
-- Build   : v135
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   Idempotent (safe to re-run).
--
-- WHY (two fixes in one migration):
--
--   FIX A — content_restored type
--     restoreItem() was incorrectly using 'content_approved' for restore events.
--     A new semantic type 'content_restored' distinguishes moderation approval
--     from admin restore, preventing confusion in notification rendering and
--     user interpretation.
--
--   FIX B — self-notification INSERT policy
--     The existing "notifications: mod insert" policy restricts ALL inserts to
--     owner/ketua/admin (get_my_role() IN ('owner','ketua','admin')).
--     Non-mod users (anggota) cannot receive submit-confirmation notifications
--     because _insertSelfNotif() calls db.from('notifications').insert() which
--     is blocked by RLS for anggota.
--
--     A new policy "notifications: self insert" allows any authenticated user
--     to insert a notification ONLY when user_id = auth.uid() (their own ID).
--
--     SECURITY ANALYSIS:
--       - User can ONLY insert with user_id = their own auth.uid()
--       - Cannot create notifications targeting other users (user_id != auth.uid()
--         will fail this policy, and "mod insert" requires owner/ketua/admin role)
--       - auth.uid() is server-side — cannot be spoofed by the client
--       - Does NOT weaken cross-user notification security in any way
--
-- DEPLOYMENT ORDER:
--   Run this SQL BEFORE deploying script.js v6.14 to production.
--   Depends on: phase15_notification_direct_insert.sql (GRANT INSERT already done)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- FIX A: Add 'content_restored' to notifications_type_check
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name        = 'notifications'
      AND constraint_name   = 'notifications_type_check'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
    RAISE NOTICE 'notifications_type_check dropped';
  END IF;

  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
      'content_deleted',
      'content_approved',
      'content_rejected',
      'content_pending',
      'content_restored',
      'revision_submitted',
      'revision_approved',
      'role_changed',
      'gallery_approved',
      'gallery_rejected',
      'finance',
      'moderasi'
    ]::text[]));

  RAISE NOTICE 'notifications_type_check recreated — content_restored added';
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- FIX B: Allow authenticated users to insert self-notifications only
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications: self insert" ON public.notifications;
CREATE POLICY "notifications: self insert"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
);

RAISE NOTICE 'notifications: self insert policy created — anggota can now insert own-user_id notifications';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT check_clause FROM information_schema.check_constraints
-- WHERE constraint_schema = 'public' AND constraint_name = 'notifications_type_check';
-- Expected: includes 'content_restored'

-- SELECT policyname, cmd, with_check FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'notifications' AND cmd = 'INSERT';
-- Expected: "notifications: mod insert" AND "notifications: self insert"
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 20
-- ═══════════════════════════════════════════════════════════════════════════
