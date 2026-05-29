-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 15 Notification Direct Insert
-- Date    : 2026-05-29
-- Build   : v128
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   Idempotent (safe to re-run).
--
-- WHY:
--   Phase13 DROP+CREATE insert_user_notification caused PostgREST schema
--   cache inconsistency → all notification inserts returned 42702.
--   Fix: replace RPC approach with direct authenticated INSERT + RLS policy
--   that restricts inserts to mod roles only (owner/ketua/admin).
--   This removes PostgREST schema cache dependency for notification inserts.
--
-- SECURITY:
--   RLS WITH CHECK ensures only owner/ketua/admin can insert.
--   user_id FK ensures target must exist in profiles.
--   anon still has NO INSERT permission.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. GRANT INSERT to authenticated (previously SELECT, UPDATE only) ─────
GRANT INSERT ON TABLE public.notifications TO authenticated;

-- ── 2. RLS: only mods can insert notifications for other users ────────────
DROP POLICY IF EXISTS "notifications: mod insert" ON public.notifications;
CREATE POLICY "notifications: mod insert"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
  get_my_role() IN ('owner', 'ketua', 'admin')
);

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT policyname, cmd, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'notifications';
-- Expected: read own (SELECT), update own (UPDATE), mod insert (INSERT)

-- SELECT privilege_type FROM information_schema.role_table_grants
-- WHERE table_name = 'notifications' AND grantee = 'authenticated';
-- Expected: SELECT, UPDATE, INSERT
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 15
-- ═══════════════════════════════════════════════════════════════════════════
