-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 1 RLS Security Policies
-- Date    : 2026-05-27
-- Project : elnmwdeckfgwfqigchjx
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   All statements are idempotent (safe to re-run).
--
-- TABLES COVERED: profiles, news, products, gallery, transactions,
--                 app_info, tickers, sponsors, logs, notifications
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 0. HELPER: get_my_role()
--    SECURITY DEFINER so it can read caller's profile row without RLS loop.
--    Used in all subsequent policies instead of repeated sub-queries.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(role, 'anggota')
  FROM public.profiles
  WHERE id = auth.uid()
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. PROFILES
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: select all"           ON public.profiles;
DROP POLICY IF EXISTS "profiles: insert own"           ON public.profiles;
DROP POLICY IF EXISTS "profiles: update own no role"   ON public.profiles;
DROP POLICY IF EXISTS "profiles: mod update any"       ON public.profiles;

-- Public author display requires guest read access to basic profile data.
-- Sensitive columns (phone, email) are never SELECT'd by the app for anon paths.
CREATE POLICY "profiles: select all"
ON public.profiles FOR SELECT
USING (true);

-- New user can create their own profile row (upsert on registration)
CREATE POLICY "profiles: insert own"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- User can edit own profile but CANNOT promote their own role.
-- get_my_role() reads the current DB value — WITH CHECK ensures NEW.role = current role.
CREATE POLICY "profiles: update own no role"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = get_my_role()
);

-- Owner / ketua can update any profile (role changes, division assignments).
-- This is the only path for role changes from the client; the update_member_role
-- RPC (SECURITY DEFINER) also handles this server-side for extra safety.
CREATE POLICY "profiles: mod update any"
ON public.profiles FOR UPDATE
TO authenticated
USING  (get_my_role() IN ('owner','ketua'))
WITH CHECK (get_my_role() IN ('owner','ketua'));

-- ─────────────────────────────────────────────────────────────────────────
-- 2. NEWS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news: anon approved"          ON public.news;
DROP POLICY IF EXISTS "news: auth select"            ON public.news;
DROP POLICY IF EXISTS "news: auth insert"            ON public.news;
DROP POLICY IF EXISTS "news: auth update"            ON public.news;
DROP POLICY IF EXISTS "news: auth delete"            ON public.news;

-- Guests see only published news
CREATE POLICY "news: anon approved"
ON public.news FOR SELECT
TO anon
USING (status = 'approved');

-- Logged-in: approved + own pending + mods see everything
CREATE POLICY "news: auth select"
ON public.news FOR SELECT
TO authenticated
USING (
  status = 'approved'
  OR user_id = auth.uid()
  OR get_my_role() IN ('owner','ketua','admin')
);

-- Any member can submit news (lands as pending)
CREATE POLICY "news: auth insert"
ON public.news FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Creator or mod can edit
CREATE POLICY "news: auth update"
ON public.news FOR UPDATE
TO authenticated
USING  (user_id = auth.uid() OR get_my_role() IN ('owner','ketua','admin'))
WITH CHECK (user_id = auth.uid() OR get_my_role() IN ('owner','ketua','admin'));

-- Creator or mod can delete
CREATE POLICY "news: auth delete"
ON public.news FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR get_my_role() IN ('owner','ketua','admin'));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. PRODUCTS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products: anon approved"  ON public.products;
DROP POLICY IF EXISTS "products: auth select"    ON public.products;
DROP POLICY IF EXISTS "products: auth insert"    ON public.products;
DROP POLICY IF EXISTS "products: auth update"    ON public.products;
DROP POLICY IF EXISTS "products: auth delete"    ON public.products;

CREATE POLICY "products: anon approved"
ON public.products FOR SELECT
TO anon
USING (status = 'approved');

CREATE POLICY "products: auth select"
ON public.products FOR SELECT
TO authenticated
USING (
  status = 'approved'
  OR user_id = auth.uid()
  OR get_my_role() IN ('owner','ketua','admin')
);

CREATE POLICY "products: auth insert"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "products: auth update"
ON public.products FOR UPDATE
TO authenticated
USING  (user_id = auth.uid() OR get_my_role() IN ('owner','ketua','admin'))
WITH CHECK (user_id = auth.uid() OR get_my_role() IN ('owner','ketua','admin'));

CREATE POLICY "products: auth delete"
ON public.products FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR get_my_role() IN ('owner','ketua','admin'));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. GALLERY
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallery: anon approved"  ON public.gallery;
DROP POLICY IF EXISTS "gallery: auth select"    ON public.gallery;
DROP POLICY IF EXISTS "gallery: auth insert"    ON public.gallery;
DROP POLICY IF EXISTS "gallery: auth update"    ON public.gallery;
DROP POLICY IF EXISTS "gallery: auth delete"    ON public.gallery;

CREATE POLICY "gallery: anon approved"
ON public.gallery FOR SELECT
TO anon
USING (status = 'approved');

CREATE POLICY "gallery: auth select"
ON public.gallery FOR SELECT
TO authenticated
USING (
  status = 'approved'
  OR user_id = auth.uid()
  OR get_my_role() IN ('owner','ketua','admin')
);

CREATE POLICY "gallery: auth insert"
ON public.gallery FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "gallery: auth update"
ON public.gallery FOR UPDATE
TO authenticated
USING  (user_id = auth.uid() OR get_my_role() IN ('owner','ketua','admin'))
WITH CHECK (user_id = auth.uid() OR get_my_role() IN ('owner','ketua','admin'));

CREATE POLICY "gallery: auth delete"
ON public.gallery FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR get_my_role() IN ('owner','ketua','admin'));

-- ─────────────────────────────────────────────────────────────────────────
-- 5. TRANSACTIONS
--    NO guest access (anon role gets nothing).
--    Members can read; only finance roles (owner/ketua/bendahara) can write.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions: auth read"      ON public.transactions;
DROP POLICY IF EXISTS "transactions: finance insert"  ON public.transactions;
DROP POLICY IF EXISTS "transactions: finance update"  ON public.transactions;
DROP POLICY IF EXISTS "transactions: finance delete"  ON public.transactions;

-- Authenticated members can read (dashboard shows aggregates; full page requires UI role check)
CREATE POLICY "transactions: auth read"
ON public.transactions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "transactions: finance insert"
ON public.transactions FOR INSERT
TO authenticated
WITH CHECK (get_my_role() IN ('owner','ketua','bendahara'));

CREATE POLICY "transactions: finance update"
ON public.transactions FOR UPDATE
TO authenticated
USING  (get_my_role() IN ('owner','ketua','bendahara'))
WITH CHECK (get_my_role() IN ('owner','ketua','bendahara'));

CREATE POLICY "transactions: finance delete"
ON public.transactions FOR DELETE
TO authenticated
USING (get_my_role() IN ('owner','ketua','bendahara'));

-- ─────────────────────────────────────────────────────────────────────────
-- 6. APP_INFO
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.app_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_info: public read"     ON public.app_info;
DROP POLICY IF EXISTS "app_info: owner ketua write" ON public.app_info;

-- Organisation info is fully public
CREATE POLICY "app_info: public read"
ON public.app_info FOR SELECT
USING (true);

-- Upsert/update restricted to leadership
CREATE POLICY "app_info: owner ketua write"
ON public.app_info FOR ALL
TO authenticated
USING  (get_my_role() IN ('owner','ketua'))
WITH CHECK (get_my_role() IN ('owner','ketua'));

-- ─────────────────────────────────────────────────────────────────────────
-- 7. TICKERS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickers: public read"  ON public.tickers;
DROP POLICY IF EXISTS "tickers: mod insert"   ON public.tickers;
DROP POLICY IF EXISTS "tickers: mod delete"   ON public.tickers;

CREATE POLICY "tickers: public read"
ON public.tickers FOR SELECT
USING (true);

CREATE POLICY "tickers: mod insert"
ON public.tickers FOR INSERT
TO authenticated
WITH CHECK (get_my_role() IN ('owner','ketua','admin'));

CREATE POLICY "tickers: mod delete"
ON public.tickers FOR DELETE
TO authenticated
USING (get_my_role() IN ('owner','ketua','admin'));

-- ─────────────────────────────────────────────────────────────────────────
-- 8. SPONSORS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sponsors: public read"       ON public.sponsors;
DROP POLICY IF EXISTS "sponsors: owner ketua insert" ON public.sponsors;
DROP POLICY IF EXISTS "sponsors: owner ketua update" ON public.sponsors;
DROP POLICY IF EXISTS "sponsors: owner ketua delete" ON public.sponsors;

CREATE POLICY "sponsors: public read"
ON public.sponsors FOR SELECT
USING (true);

CREATE POLICY "sponsors: owner ketua insert"
ON public.sponsors FOR INSERT
TO authenticated
WITH CHECK (get_my_role() IN ('owner','ketua'));

CREATE POLICY "sponsors: owner ketua update"
ON public.sponsors FOR UPDATE
TO authenticated
USING  (get_my_role() IN ('owner','ketua'))
WITH CHECK (get_my_role() IN ('owner','ketua'));

CREATE POLICY "sponsors: owner ketua delete"
ON public.sponsors FOR DELETE
TO authenticated
USING (get_my_role() IN ('owner','ketua'));

-- ─────────────────────────────────────────────────────────────────────────
-- 9. LOGS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logs: owner ketua read"  ON public.logs;
DROP POLICY IF EXISTS "logs: auth insert"        ON public.logs;

-- Audit log visible to leadership only
CREATE POLICY "logs: owner ketua read"
ON public.logs FOR SELECT
TO authenticated
USING (get_my_role() IN ('owner','ketua'));

-- Any authenticated user can append to audit log
CREATE POLICY "logs: auth insert"
ON public.logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 10. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications: read own"    ON public.notifications;
DROP POLICY IF EXISTS "notifications: update own"  ON public.notifications;

-- Users see only their own notifications
CREATE POLICY "notifications: read own"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can mark own notifications as read
CREATE POLICY "notifications: update own"
ON public.notifications FOR UPDATE
TO authenticated
USING  (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- No direct INSERT from client — use insert_user_notification RPC (SECURITY DEFINER)

-- ─────────────────────────────────────────────────────────────────────────
-- 11. RPC PATCH: update_member_role — add role whitelist + caller auth
--
--    The current client sends the role string from a dropdown with no server-side
--    validation. This patch adds: caller role check, role whitelist, and
--    owner-promotion guard.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_member_role(target_uid UUID, new_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role NOT IN ('owner', 'ketua') THEN
    RAISE EXCEPTION 'Access denied: caller role % is not authorized', caller_role;
  END IF;

  IF new_role NOT IN ('owner', 'ketua', 'admin', 'bendahara', 'anggota') THEN
    RAISE EXCEPTION 'Invalid role value: %', new_role;
  END IF;

  -- Only owner can assign the owner role
  IF new_role = 'owner' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Only owner can assign the owner role';
  END IF;

  -- Prevent self-demotion of the last owner (optional safety guard)
  IF target_uid = auth.uid() AND caller_role = 'owner' AND new_role != 'owner' THEN
    IF (SELECT COUNT(*) FROM public.profiles WHERE role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the only owner';
    END IF;
  END IF;

  UPDATE public.profiles SET role = new_role WHERE id = target_uid;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run after applying policies)
-- ─────────────────────────────────────────────────────────────────────────
-- Check all RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- List all policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 1
-- ═══════════════════════════════════════════════════════════════════════════
