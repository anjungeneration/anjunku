-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 18 Notification Type Normalization
-- Date    : 2026-06-02
-- Build   : v134
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   Idempotent (safe to re-run).
--
-- WHY:
--   v134 introduces 3 new semantic notification types to replace the overloaded
--   'content_approved' type that was used for 6+ distinct scenarios:
--
--   content_pending    → content/revision submitted and awaiting mod approval
--                        (received by: owner, ketua, admin)
--   revision_submitted → a moderator revised your content; awaiting approval
--                        (received by: original content owner)
--   revision_approved  → a revision was approved and applied to the original
--                        (received by: revision submitter + original owner)
--
--   Without these types in the CHECK constraint, any INSERT with these new
--   types would fail with error 23514, silently caught by _insertNotif().
--
-- DEPLOYMENT ORDER:
--   Run this SQL BEFORE deploying script.js v6.13 to production.
--
-- BACKWARD COMPATIBILITY:
--   Existing 'content_approved' and 'gallery_approved' rows are unchanged.
--   Old rows with those types continue to render correctly.
-- ═══════════════════════════════════════════════════════════════════════════

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
      'revision_submitted',
      'revision_approved',
      'role_changed',
      'gallery_approved',
      'gallery_rejected',
      'finance',
      'moderasi'
    ]::text[]));

  RAISE NOTICE 'notifications_type_check recreated — content_pending, revision_submitted, revision_approved added';
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_schema = 'public'
--   AND constraint_name   = 'notifications_type_check';
-- Expected: includes 'content_pending', 'revision_submitted', 'revision_approved'
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 18
-- ═══════════════════════════════════════════════════════════════════════════
