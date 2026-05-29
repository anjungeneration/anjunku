-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 11 Finance Audit Global RPC
-- Date    : 2026-05-29
-- Build   : v122
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   All statements are idempotent (safe to re-run).
--
-- COVERS:
--   get_finance_audit(p_limit INT DEFAULT 50)
--     SECURITY DEFINER — returns all finance moderation_history rows
--     (table_name = 'transactions') without needing a specific record_id.
--     Allows owner/ketua/bendahara to see audit trail for ALL transactions
--     including soft-deleted ones.
--     Access: owner / ketua / bendahara only.
--     Returns up to p_limit rows (max 100), newest first.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_finance_audit(p_limit INT DEFAULT 50)
RETURNS TABLE (
  id          UUID,
  record_id   TEXT,
  action      TEXT,
  actor_name  TEXT,
  metadata    JSONB,
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
    RAISE EXCEPTION 'get_finance_audit: unauthenticated';
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('owner', 'ketua', 'bendahara') THEN
    RAISE EXCEPTION 'get_finance_audit: role % not authorized', caller_role;
  END IF;

  RETURN QUERY
  SELECT h.id, h.record_id, h.action, h.actor_name, h.metadata, h.created_at
  FROM public.moderation_history h
  WHERE h.table_name = 'transactions'
    AND h.action IN ('finance_create', 'finance_update', 'finance_delete')
  ORDER BY h.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$$;

-- Grant to authenticated (RPC itself enforces role check internally)
GRANT EXECUTE ON FUNCTION public.get_finance_audit(INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT proname, prosecdef FROM pg_proc
-- JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
-- WHERE nspname = 'public' AND proname = 'get_finance_audit';
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 11
-- ═══════════════════════════════════════════════════════════════════════════
