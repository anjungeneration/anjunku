-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 10 Finance History RPC
-- Date    : 2026-05-29
-- Build   : v124
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   All statements are idempotent (safe to re-run).
--
-- COVERS:
--   get_finance_history(p_record_id TEXT)
--     SECURITY DEFINER — bypasses moderation_history RLS (which only allows
--     owner/ketua to SELECT) so that bendahara can also read finance audit
--     entries for transactions they manage.
--     Access: owner / ketua / bendahara only.
--     Returns last 20 rows for the given transaction ID.
--
-- NOTE: Parameter changed UUID → TEXT (v124) so PostgREST passes JS string
--       directly without implicit cast (avoids 42702 type-resolution error).
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop old UUID-typed overload if it exists before recreating with TEXT
DROP FUNCTION IF EXISTS public.get_finance_history(UUID);

CREATE OR REPLACE FUNCTION public.get_finance_history(p_record_id TEXT)
RETURNS TABLE (
  id          UUID,
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
    RAISE EXCEPTION 'get_finance_history: unauthenticated';
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('owner', 'ketua', 'bendahara') THEN
    RAISE EXCEPTION 'get_finance_history: role % not authorized', caller_role;
  END IF;

  RETURN QUERY
  SELECT h.id, h.action, h.actor_name, h.metadata, h.created_at
  FROM public.moderation_history h
  WHERE h.table_name = 'transactions'
    AND h.record_id  = p_record_id
    AND h.action IN ('finance_create', 'finance_update', 'finance_delete')
  ORDER BY h.created_at DESC
  LIMIT 20;
END;
$$;

-- Grant to authenticated (RPC itself enforces role check internally)
GRANT EXECUTE ON FUNCTION public.get_finance_history(TEXT) TO authenticated;

-- Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT proname, prosecdef FROM pg_proc
-- JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
-- WHERE nspname = 'public' AND proname = 'get_finance_history';
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 10 (v124)
-- ═══════════════════════════════════════════════════════════════════════════
