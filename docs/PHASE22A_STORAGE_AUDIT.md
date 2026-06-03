# PHASE 22A — Storage Cleanup Audit

**Date:** 2026-06-03  
**Branch:** phase22_critical_bugfix  
**Status:** RESOLVED — access guard hardened, no orphan-creation code path changed

---

## Root Cause

File orphans in Supabase Storage occur when content rows are **soft-deleted** (setting `deleted_at` on the DB row) but the associated files in the `gallery`, `news`, or `products` buckets are **not immediately removed**. This is by design — soft deletion preserves files during the 30-day recovery window. However, if `_purgeDeletedContent()` is never called (e.g., because KETUA role had access and manually triggered purge), orphans can accumulate indefinitely.

A secondary risk: `_purgeDeletedContent()` was guarded by `isOK()` (= `isOwner() || isKetua()`), meaning KETUA could trigger storage purge directly. This was not the intended behavior.

---

## Functions Audited

| Function | File | Line | Orphan Risk? | Notes |
|---|---|---|---|---|
| `deleteNews()` | script.js | 2583 | No | Soft-delete only; no storage op. Files preserved for restore. |
| `deleteProduct()` | script.js | 2779 | No | Same pattern. |
| `deleteGallery()` | script.js | 3396 | No | Same pattern. |
| `deleteTrx()` | script.js | 2975 | N/A | No file attachments. |
| `deleteSponsor()` | script.js | 4563 | No | Soft-delete only. |
| `_purgeDeletedContent()` | script.js | 3578 | **Fixed** | Was `isOK()`, now `isOwner()` — KETUA can no longer trigger hard purge. |
| `deleteStorageFile()` | script.js | 180 | No | Works correctly; called by `_purgeDeletedContent()` during hard purge. |
| `extractStoragePath()` | script.js | 172 | No | Correctly strips `/${bucket}/` prefix from full Supabase URL. |
| `mmParseUrls()` | script.js | 917 | No | Correctly parses JSON `media_urls` with `image_url` fallback. |

---

## Fix Applied (22E overlaps 22A)

```diff
// script.js line 3578
- if (!isOK()) return;
+ if (!isOwner()) return;
```

**Effect:** KETUA can no longer call `_purgeDeletedContent()`. Only OWNER can permanently delete files from storage.

---

## Soft-Delete Flow (unchanged, correct)

```
User deletes content
  → deleted_at = NOW()              # DB row soft-deleted
  → Files remain in Storage         # 30-day recovery window
  → _purgeDeletedContent() called   # Owner triggers hard purge
      → deleteStorageFile()          # Removes file from bucket
      → DB row permanently deleted   # Row removed from table
```

---

## Recommendations

1. **Scheduled cleanup job** — Consider a Supabase Edge Function or cron job that auto-purges rows where `deleted_at < NOW() - INTERVAL '30 days'` to prevent indefinite orphan accumulation.
2. **Orphan detection** — Periodically list storage bucket files and cross-reference against DB `media_urls` / `image_url` columns to surface orphaned files.
3. **Upload cleanup on error** — If `handleSaveGallery()` / `handleSaveNews()` fail after upload but before DB insert, the uploaded file becomes an orphan. Consider a try/catch that calls `deleteStorageFile()` on upload rollback.
