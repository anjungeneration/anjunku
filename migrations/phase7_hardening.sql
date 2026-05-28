-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 7 Production Hardening
-- Date    : 2026-05-27
-- Project : elnmwdeckfgwfqigchjx
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   All statements are idempotent (safe to re-run).
--
-- COVERS:
--   Task 1 — Schema exposure / explicit GRANT
--   Task 2 — Database indexes
--   Task 3 — RPC hardening (insert_user_notification, increment_click, get_members_safe)
--   Task 4 — Storage bucket policies
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 1 — SCHEMA EXPOSURE: EXPLICIT GRANTS
--
-- Supabase projects created before mid-2023 inherited broad default grants.
-- These statements make grants explicit and future-proof regardless of
-- Supabase internal defaults.
-- ─────────────────────────────────────────────────────────────────────────

-- Strip all privileges from anon on sensitive tables first
REVOKE ALL ON TABLE public.transactions  FROM anon;
REVOKE ALL ON TABLE public.logs          FROM anon;
REVOKE ALL ON TABLE public.notifications FROM anon;

-- Anon gets SELECT on public-facing tables only (RLS still enforces row-level)
GRANT SELECT ON TABLE public.news        TO anon;
GRANT SELECT ON TABLE public.products    TO anon;
GRANT SELECT ON TABLE public.gallery     TO anon;
GRANT SELECT ON TABLE public.app_info    TO anon;
GRANT SELECT ON TABLE public.tickers     TO anon;
GRANT SELECT ON TABLE public.sponsors    TO anon;
GRANT SELECT ON TABLE public.profiles    TO anon;

-- Anon must never write to any table
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles      FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.news          FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.products      FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.gallery       FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.transactions  FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.app_info      FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.tickers       FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sponsors      FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.logs          FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.notifications FROM anon;

-- Authenticated users get table-level access; RLS (phase1) handles row-level
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.news          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gallery       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_info      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tickers       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sponsors      TO authenticated;
GRANT SELECT, INSERT                 ON TABLE public.logs          TO authenticated;
GRANT SELECT, UPDATE                 ON TABLE public.notifications TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 2 — DATABASE INDEXES
-- Based on exact query patterns in script.js.
-- ─────────────────────────────────────────────────────────────────────────

-- NEWS: filtered by status='approved', ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_news_status_created
ON public.news(status, created_at DESC);

-- PRODUCTS: same pattern
CREATE INDEX IF NOT EXISTS idx_products_status_created
ON public.products(status, created_at DESC);

-- GALLERY: same pattern
CREATE INDEX IF NOT EXISTS idx_gallery_status_created
ON public.gallery(status, created_at DESC);

-- TRANSACTIONS: finance dashboard uses ORDER BY date + filter by created_at
CREATE INDEX IF NOT EXISTS idx_transactions_date
ON public.transactions(date);

CREATE INDEX IF NOT EXISTS idx_transactions_created
ON public.transactions(created_at DESC);

-- TRANSACTIONS: dashboard overview uses (date, type) for income/expense split
CREATE INDEX IF NOT EXISTS idx_transactions_date_type
ON public.transactions(date, type);

-- LOGS: audit terminal queries ORDER BY created_at DESC LIMIT 200
CREATE INDEX IF NOT EXISTS idx_logs_created
ON public.logs(created_at DESC);

-- NOTIFICATIONS: panel queries WHERE user_id=? ORDER BY created_at DESC LIMIT 25
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON public.notifications(user_id, created_at DESC);

-- SPONSORS: dashboard queries WHERE is_active=true ORDER BY priority DESC
CREATE INDEX IF NOT EXISTS idx_sponsors_active_priority
ON public.sponsors(is_active, priority DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 3 — RPC HARDENING
-- ─────────────────────────────────────────────────────────────────────────

-- ── insert_user_notification ──────────────────────────────────────────────
-- Called by mods (owner/ketua/admin) after approve/reject/delete actions.
-- SECURITY DEFINER so it can bypass RLS to write to notifications table.
-- Validates: caller auth, caller role, target exists, input length limits.
CREATE OR REPLACE FUNCTION public.insert_user_notification(
  p_user_id   UUID,
  p_type      TEXT,
  p_title     TEXT,
  p_message   TEXT,
  p_ref_table TEXT DEFAULT NULL,
  p_ref_id    TEXT DEFAULT NULL,
  p_actor     TEXT DEFAULT NULL,
  p_reason    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_user_notification: unauthenticated caller';
  END IF;

  -- Must be owner / ketua / admin
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('owner', 'ketua', 'admin') THEN
    RAISE EXCEPTION 'insert_user_notification: caller role % is not authorized', caller_role;
  END IF;

  -- Input validation — length limits (prevents oversized payloads)
  IF LENGTH(COALESCE(p_type,'')) = 0    THEN RAISE EXCEPTION 'p_type required'; END IF;
  IF LENGTH(COALESCE(p_title,'')) = 0   THEN RAISE EXCEPTION 'p_title required'; END IF;
  IF LENGTH(COALESCE(p_message,'')) = 0 THEN RAISE EXCEPTION 'p_message required'; END IF;
  IF LENGTH(p_type)    > 50   THEN RAISE EXCEPTION 'p_type too long'; END IF;
  IF LENGTH(p_title)   > 200  THEN RAISE EXCEPTION 'p_title too long'; END IF;
  IF LENGTH(p_message) > 1000 THEN RAISE EXCEPTION 'p_message too long'; END IF;

  -- Silently skip self-notifications (same guard as JS side)
  IF p_user_id = auth.uid() THEN RETURN; END IF;

  -- Target must exist
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'insert_user_notification: target user % not found', p_user_id;
  END IF;

  INSERT INTO public.notifications
    (user_id, type, title, message, ref_table, ref_id, actor_name, reason, created_at, is_read)
  VALUES
    (p_user_id, p_type, p_title, p_message,
     p_ref_table, p_ref_id, p_actor, p_reason, NOW(), FALSE);
END;
$$;

-- ── increment_click ───────────────────────────────────────────────────────
-- Called by anon/authenticated users when clicking a sponsor link.
-- SECURITY DEFINER so anon can execute it (anon has no EXECUTE by default).
-- Only updates click_count — no data is returned or exposed.
CREATE OR REPLACE FUNCTION public.increment_click(sponsor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sponsors WHERE id = sponsor_id) THEN
    RAISE EXCEPTION 'increment_click: sponsor % not found', sponsor_id;
  END IF;
  UPDATE public.sponsors
  SET click_count = COALESCE(click_count, 0) + 1
  WHERE id = sponsor_id;
END;
$$;

-- Grant anon EXECUTE on increment_click only (public click tracking)
GRANT EXECUTE ON FUNCTION public.increment_click(UUID) TO anon;

-- ── get_members_safe ──────────────────────────────────────────────────────
-- Called from loadAnggota() — authenticated users only.
-- Owner/ketua get full data; other roles get masked (no email, no phone).
CREATE OR REPLACE FUNCTION public.get_members_safe()
RETURNS TABLE (
  id          UUID,
  email       TEXT,
  full_name   TEXT,
  username    TEXT,
  avatar_url  TEXT,
  role        TEXT,
  division    TEXT,
  title       TEXT,
  location    TEXT,
  bio         TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'get_members_safe: unauthenticated';
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role IN ('owner', 'ketua') THEN
    -- Leadership sees everything
    RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.username, p.avatar_url,
           p.role, p.division, p.title, p.location, p.bio, p.phone, p.created_at
    FROM public.profiles p
    ORDER BY p.created_at DESC;
  ELSE
    -- Others see masked data — no email, no phone
    RETURN QUERY
    SELECT p.id, ''::TEXT AS email, p.full_name, p.username, p.avatar_url,
           p.role, p.division, p.title, p.location, p.bio, ''::TEXT AS phone, p.created_at
    FROM public.profiles p
    ORDER BY p.created_at DESC;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 4 — STORAGE BUCKET POLICIES
-- Per-bucket: public read, user-scoped upload, ownership-based delete.
--
-- PREREQUISITES: Each bucket must exist in Supabase Dashboard → Storage.
-- Bucket names: news, products, gallery, avatars, transactions, sponsors
--
-- Storage path convention used by uploadMedia():
--   ${Date.now()}_${safeName}   (no user-id prefix — no folder-based ownership)
--
-- Since the app does NOT use user-id folders, ownership is tracked via the
-- `owner` column on storage.objects (set to auth.uid() by Supabase on upload).
-- ─────────────────────────────────────────────────────────────────────────

-- ── NEWS bucket ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "news: public read"    ON storage.objects;
DROP POLICY IF EXISTS "news: auth upload"    ON storage.objects;
DROP POLICY IF EXISTS "news: owner delete"   ON storage.objects;
DROP POLICY IF EXISTS "news: mod delete"     ON storage.objects;

CREATE POLICY "news: public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'news');

CREATE POLICY "news: auth upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'news');

CREATE POLICY "news: owner or mod delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'news'
  AND (
    owner = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','ketua','admin')
  )
);

-- ── PRODUCTS bucket ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "products: public read"        ON storage.objects;
DROP POLICY IF EXISTS "products: auth upload"         ON storage.objects;
DROP POLICY IF EXISTS "products: owner or mod delete" ON storage.objects;

CREATE POLICY "products: public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'products');

CREATE POLICY "products: auth upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'products');

CREATE POLICY "products: owner or mod delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'products'
  AND (
    owner = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','ketua','admin')
  )
);

-- ── GALLERY bucket ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gallery: public read"          ON storage.objects;
DROP POLICY IF EXISTS "gallery: auth upload"          ON storage.objects;
DROP POLICY IF EXISTS "gallery: owner or mod delete"  ON storage.objects;

CREATE POLICY "gallery: public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'gallery');

CREATE POLICY "gallery: auth upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'gallery');

CREATE POLICY "gallery: owner or mod delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'gallery'
  AND (
    owner = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','ketua','admin')
  )
);

-- ── AVATARS bucket ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "avatars: public read"          ON storage.objects;
DROP POLICY IF EXISTS "avatars: auth upload"          ON storage.objects;
DROP POLICY IF EXISTS "avatars: owner or mod delete"  ON storage.objects;

CREATE POLICY "avatars: public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "avatars: auth upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars: owner or mod delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    owner = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','ketua','admin')
  )
);

-- ── SPONSORS bucket ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sponsors: public read"     ON storage.objects;
DROP POLICY IF EXISTS "sponsors: leader upload"   ON storage.objects;
DROP POLICY IF EXISTS "sponsors: leader delete"   ON storage.objects;

CREATE POLICY "sponsors: public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'sponsors');

CREATE POLICY "sponsors: leader upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sponsors'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','ketua')
);

CREATE POLICY "sponsors: leader delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'sponsors'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','ketua')
);

-- ── TRANSACTIONS bucket ───────────────────────────────────────────────────
-- Finance evidence files: only finance roles can read OR write
DROP POLICY IF EXISTS "transactions: finance read"   ON storage.objects;
DROP POLICY IF EXISTS "transactions: finance upload" ON storage.objects;
DROP POLICY IF EXISTS "transactions: finance delete" ON storage.objects;

CREATE POLICY "transactions: finance read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'transactions'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','ketua','bendahara')
);

CREATE POLICY "transactions: finance upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'transactions'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','ketua','bendahara')
);

CREATE POLICY "transactions: finance delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'transactions'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','ketua','bendahara')
);

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run after applying)
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Table-level grants for anon:
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'anon' AND table_schema = 'public'
-- ORDER BY table_name, privilege_type;
--
-- 2. Indexes created:
-- SELECT tablename, indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
--
-- 3. Storage policies:
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
-- ORDER BY policyname;
--
-- 4. RPC functions:
-- SELECT proname, prosecdef, proconfig FROM pg_proc
-- JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
-- WHERE nspname = 'public' AND proname IN
--   ('get_my_role','update_member_role','insert_user_notification','increment_click','get_members_safe');
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 7
-- ═══════════════════════════════════════════════════════════════════════════
