-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Priority 1: Backup & Recovery System
-- Date    : 2026-05-27
-- Project : elnmwdeckfgwfqigchjx
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   All statements are idempotent (safe to re-run).
--
-- COVERS:
--   Task 1 — Soft-delete columns (news, products, gallery, transactions)
--   Task 2 — Updated RLS SELECT policies (filter deleted_at IS NULL for non-mods)
--   Task 3 — moderation_history table (immutable append-only audit log)
--   Task 4 — Indexes for soft-delete and moderation_history
--   Task 5 — restore_soft_deleted() SECURITY DEFINER RPC
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 1 — SOFT-DELETE COLUMNS
-- ADD COLUMN is idempotent via DO block.
-- deleted_at  : timestamp of soft-delete (NULL = active)
-- deleted_by  : UUID of the actor who soft-deleted (FK to profiles)
-- delete_reason: optional free-text reason
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- NEWS
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='news'         AND column_name='deleted_at')     THEN ALTER TABLE public.news         ADD COLUMN deleted_at     TIMESTAMPTZ DEFAULT NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='news'         AND column_name='deleted_by')     THEN ALTER TABLE public.news         ADD COLUMN deleted_by     UUID        DEFAULT NULL REFERENCES public.profiles(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='news'         AND column_name='delete_reason')  THEN ALTER TABLE public.news         ADD COLUMN delete_reason  TEXT        DEFAULT NULL; END IF;

  -- PRODUCTS
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products'     AND column_name='deleted_at')     THEN ALTER TABLE public.products     ADD COLUMN deleted_at     TIMESTAMPTZ DEFAULT NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products'     AND column_name='deleted_by')     THEN ALTER TABLE public.products     ADD COLUMN deleted_by     UUID        DEFAULT NULL REFERENCES public.profiles(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products'     AND column_name='delete_reason')  THEN ALTER TABLE public.products     ADD COLUMN delete_reason  TEXT        DEFAULT NULL; END IF;

  -- GALLERY
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gallery'      AND column_name='deleted_at')     THEN ALTER TABLE public.gallery      ADD COLUMN deleted_at     TIMESTAMPTZ DEFAULT NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gallery'      AND column_name='deleted_by')     THEN ALTER TABLE public.gallery      ADD COLUMN deleted_by     UUID        DEFAULT NULL REFERENCES public.profiles(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gallery'      AND column_name='delete_reason')  THEN ALTER TABLE public.gallery      ADD COLUMN delete_reason  TEXT        DEFAULT NULL; END IF;

  -- TRANSACTIONS
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='deleted_at')     THEN ALTER TABLE public.transactions ADD COLUMN deleted_at     TIMESTAMPTZ DEFAULT NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='deleted_by')     THEN ALTER TABLE public.transactions ADD COLUMN deleted_by     UUID        DEFAULT NULL REFERENCES public.profiles(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='delete_reason')  THEN ALTER TABLE public.transactions ADD COLUMN delete_reason  TEXT        DEFAULT NULL; END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 2 — UPDATED RLS SELECT POLICIES
-- Non-mods only see active (deleted_at IS NULL) records.
-- Mods (owner/ketua/admin) see everything including soft-deleted rows
-- so they can perform restore operations.
-- ─────────────────────────────────────────────────────────────────────────

-- ── NEWS ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "news: anon approved" ON public.news;
DROP POLICY IF EXISTS "news: auth select"   ON public.news;

CREATE POLICY "news: anon approved"
ON public.news FOR SELECT
TO anon
USING (status = 'approved' AND deleted_at IS NULL);

CREATE POLICY "news: auth select"
ON public.news FOR SELECT
TO authenticated
USING (
  get_my_role() IN ('owner','ketua','admin')
  OR (
    deleted_at IS NULL
    AND (status = 'approved' OR user_id = auth.uid())
  )
);

-- ── PRODUCTS ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "products: anon approved" ON public.products;
DROP POLICY IF EXISTS "products: auth select"   ON public.products;

CREATE POLICY "products: anon approved"
ON public.products FOR SELECT
TO anon
USING (status = 'approved' AND deleted_at IS NULL);

CREATE POLICY "products: auth select"
ON public.products FOR SELECT
TO authenticated
USING (
  get_my_role() IN ('owner','ketua','admin')
  OR (
    deleted_at IS NULL
    AND (status = 'approved' OR user_id = auth.uid())
  )
);

-- ── GALLERY ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gallery: anon approved" ON public.gallery;
DROP POLICY IF EXISTS "gallery: auth select"   ON public.gallery;

CREATE POLICY "gallery: anon approved"
ON public.gallery FOR SELECT
TO anon
USING (status = 'approved' AND deleted_at IS NULL);

CREATE POLICY "gallery: auth select"
ON public.gallery FOR SELECT
TO authenticated
USING (
  get_my_role() IN ('owner','ketua','admin')
  OR (
    deleted_at IS NULL
    AND (status = 'approved' OR user_id = auth.uid())
  )
);

-- ── TRANSACTIONS ──────────────────────────────────────────────────────────
-- Finance roles (owner/ketua/bendahara) see deleted rows for restore.
-- Regular authenticated members only see active rows.
DROP POLICY IF EXISTS "transactions: auth read" ON public.transactions;

CREATE POLICY "transactions: auth read"
ON public.transactions FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  OR get_my_role() IN ('owner','ketua','bendahara')
);

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 3 — MODERATION HISTORY TABLE
-- Immutable append-only audit trail for all moderation actions.
-- No UPDATE/DELETE policies = rows cannot be changed once written.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.moderation_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT        NOT NULL,
  record_id   TEXT        NOT NULL,
  action      TEXT        NOT NULL,     -- 'approve', 'reject', 'delete', 'restore', 'revision_approve', 'revision_reject'
  actor_id    UUID        NOT NULL REFERENCES public.profiles(id),
  actor_name  TEXT        NOT NULL,
  reason      TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.moderation_history ENABLE ROW LEVEL SECURITY;

-- Leadership can read the full audit trail
DROP POLICY IF EXISTS "moderation_history: leader read" ON public.moderation_history;
CREATE POLICY "moderation_history: leader read"
ON public.moderation_history FOR SELECT
TO authenticated
USING (get_my_role() IN ('owner','ketua'));

-- Any authenticated user can insert (RPC validates further)
DROP POLICY IF EXISTS "moderation_history: auth insert" ON public.moderation_history;
CREATE POLICY "moderation_history: auth insert"
ON public.moderation_history FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());

-- No UPDATE or DELETE policies = immutable rows

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 4 — INDEXES
-- Partial indexes on deleted_at for fast "active records only" scans.
-- ─────────────────────────────────────────────────────────────────────────

-- Partial index: only indexes soft-deleted rows (small, fast for restore queries)
CREATE INDEX IF NOT EXISTS idx_news_deleted         ON public.news(deleted_at)         WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted     ON public.products(deleted_at)     WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gallery_deleted      ON public.gallery(deleted_at)      WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_deleted ON public.transactions(deleted_at) WHERE deleted_at IS NOT NULL;

-- moderation_history: actor lookup + table/record lookup
CREATE INDEX IF NOT EXISTS idx_modhistory_actor      ON public.moderation_history(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modhistory_record     ON public.moderation_history(table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modhistory_created    ON public.moderation_history(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 5 — restore_soft_deleted() RPC
-- Mod-only. Clears deleted_at/deleted_by/delete_reason on the target row.
-- Table name is whitelisted to prevent SQL injection.
-- SECURITY DEFINER bypasses RLS so mods can restore without SELECT access
-- to the deleted row.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_soft_deleted(p_table TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  rows_updated INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'restore_soft_deleted: unauthenticated';
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('owner', 'ketua', 'admin') THEN
    RAISE EXCEPTION 'restore_soft_deleted: caller role % is not authorized', caller_role;
  END IF;

  IF p_table NOT IN ('news', 'products', 'gallery', 'transactions') THEN
    RAISE EXCEPTION 'restore_soft_deleted: invalid table name %', p_table;
  END IF;

  IF p_table = 'news' THEN
    UPDATE public.news
       SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
     WHERE id = p_id AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
  ELSIF p_table = 'products' THEN
    UPDATE public.products
       SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
     WHERE id = p_id AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
  ELSIF p_table = 'gallery' THEN
    UPDATE public.gallery
       SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
     WHERE id = p_id AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
  ELSIF p_table = 'transactions' THEN
    UPDATE public.transactions
       SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
     WHERE id = p_id AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
  END IF;

  IF rows_updated = 0 THEN
    RAISE EXCEPTION 'restore_soft_deleted: record % not found or not soft-deleted', p_id;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run after applying)
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Confirm soft-delete columns added:
-- SELECT table_name, column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND column_name IN ('deleted_at','deleted_by','delete_reason')
-- ORDER BY table_name, column_name;
--
-- 2. Confirm moderation_history table exists with RLS:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'moderation_history';
--
-- 3. Updated SELECT policies:
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('news','products','gallery','transactions')
--   AND cmd = 'SELECT'
-- ORDER BY tablename, policyname;
--
-- 4. Confirm restore RPC:
-- SELECT proname, prosecdef, proconfig FROM pg_proc
-- JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
-- WHERE nspname = 'public' AND proname = 'restore_soft_deleted';
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PRIORITY 1 ROADMAP
-- ═══════════════════════════════════════════════════════════════════════════
