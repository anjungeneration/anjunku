-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 14 Notification Realtime Fix
-- Date    : 2026-05-29
-- Build   : v127
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   All statements are idempotent (safe to re-run).
--
-- ROOT CAUSE:
--   notifications table was never added to supabase_realtime publication.
--   postgres_changes listener in _subscribeNotifs() received zero events
--   even when inserts succeeded — realtime delivery never worked.
--
-- COVERS:
--   1. Add notifications to supabase_realtime (idempotent DO block)
--   2. REPLICA IDENTITY FULL — required for row-level filter user_id=eq.X
--   3. Also ensure news + products are published (for UPDATE approval events)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. REPLICA IDENTITY FULL ─────────────────────────────────────────────
-- Required so Supabase Realtime can supply the full row payload for
-- row-level filtered subscriptions (user_id=eq.X).
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ── 2. ADD TO supabase_realtime PUBLICATION ────────────────────────────────
DO $$
BEGIN
  -- notifications: personal delivery via postgres_changes INSERT filter
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  -- news: realtime approval badge (UPDATE event in _subscribeNotifs)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'news'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.news;
  END IF;

  -- products: same pattern as news
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- DIAGNOSTIC SQL PACK
-- Run these after applying the migration to verify everything is correct.
-- ─────────────────────────────────────────────────────────────────────────

-- CHECK 1: Confirm tables are in realtime publication
-- SELECT schemaname, tablename
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime'
-- ORDER BY tablename;
-- Expected: notifications, news, products (and others already there)

-- CHECK 2: Confirm replica identity
-- SELECT relname, relreplident
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND relname IN ('notifications','news','products');
-- Expected: relreplident = 'f' (full) for notifications, 'd' or 'f' for others

-- CHECK 3: Recent notifications in DB (confirms insert is working)
-- SELECT id, user_id, type, title, created_at
-- FROM public.notifications
-- ORDER BY created_at DESC
-- LIMIT 10;

-- CHECK 4: Confirm insert_user_notification function exists with correct param types
-- SELECT proname, pg_catalog.pg_get_function_arguments(p.oid) AS args
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'insert_user_notification';

-- CHECK 5: RLS policies on notifications
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'notifications';

-- CHECK 6: Test manual notification insert (run as authenticated user)
-- SELECT public.insert_user_notification(
--   '<target-user-uuid>',
--   'moderasi',
--   'Test Notif',
--   'Pesan test dari SQL editor.',
--   NULL, NULL, 'SQL Test', NULL
-- );
-- Then check: SELECT * FROM public.notifications ORDER BY created_at DESC LIMIT 1;
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 14
-- ═══════════════════════════════════════════════════════════════════════════
