# ANJUNKU — V136 Test Plan
**Branch:** `hotfix_v136_regression`  
**Preview URL:** https://anjungeneration.github.io/anjunku/  
**Database:** `elnmwdeckfgwfqigchjx.supabase.co` (production — shared)  
**Dibuat:** 2026-06-03  

---

## ⚠️ Supabase Safety Notice

Preview environment **memakai database production yang sama** (tidak ada staging DB terpisah).

| Resource | Status | Risiko |
|---|---|---|
| PostgreSQL DB | ✅ Production | Tulis data test akan muncul di production |
| Storage Buckets | ✅ Production | File upload masuk ke bucket production |
| Realtime channels | ✅ Production | Notif realtime diterima semua user aktif |
| Auth | ✅ Production | Login pakai akun production asli |

**Mitigasi:**
- Gunakan akun test yang sudah ada (role: `anggota`)
- Beri judul/caption konten test dengan prefix `[TEST]` agar mudah dibersihkan
- Jangan jalankan **T4-PURGE** di data production tanpa konfirmasi owner
- Setelah testing selesai, purge semua konten berlabel `[TEST]` dari admin panel

---

## TEST T4 — Storage Cleanup (Soft Delete → Hard Delete → Restore → Purge)

**Prerequisite:** Login sebagai user dengan role `anggota` atau lebih tinggi.  
**Akun:** Gunakan 2 akun berbeda (akun A = pembuat konten, akun B = observer).

### T4-A: Soft Delete
**Langkah:**
1. Buka halaman Gallery / News / Products
2. Upload konten baru dengan judul `[TEST] Storage Cleanup T4`
3. Catat ID konten dari browser URL atau admin panel
4. Delete konten tersebut (tombol hapus)
5. Cek di admin panel > Storage Cleanup → tabel seharusnya muncul di "Deleted"

**Expected Result:**
- Konten tidak muncul di halaman publik
- Konten masih ada di tabel dengan `deleted_at` terisi
- File masih ada di Supabase Storage bucket
- Badge `DELETED` muncul di admin view

**Fail Condition:**
- Konten masih muncul di halaman publik
- `deleted_at` NULL setelah delete
- File hilang dari storage padahal baru soft-delete

---

### T4-B: Restore
**Langkah:**
1. Dari admin panel, buka Storage Cleanup
2. Cari konten `[TEST] Storage Cleanup T4`
3. Klik tombol **Restore**
4. Cek apakah konten kembali muncul di halaman publik

**Expected Result:**
- Konten kembali visible di halaman publik
- `deleted_at` menjadi NULL
- Storage file tetap ada (tidak berubah)
- Notifikasi `content_restored` dikirim ke pemilik konten

**Fail Condition:**
- Konten tidak muncul setelah restore
- `deleted_at` masih terisi setelah restore
- Error 404 atau RPC error di console

---

### T4-C: Hard Delete (Purge)
> ⚠️ **IRREVERSIBLE** — file dihapus dari storage selamanya.  
> Jalankan hanya di konten test berlabel `[TEST]`.

**Langkah:**
1. Soft-delete konten `[TEST] Storage Cleanup T4` (ulangi T4-A)
2. Tunggu atau ubah manual `deleted_at` ke lebih dari 30 hari yang lalu (via SQL editor Supabase)
   — atau gunakan tombol purge langsung jika admin panel mendukung force-purge
3. Dari admin panel, klik **Purge** pada tabel yang sesuai
4. Konfirmasi dialog

**Expected Result:**
- Baris hilang dari database tabel asli
- File tidak lagi ada di Supabase Storage
- Tabel Storage Cleanup menampilkan "0 items pending purge"

**Fail Condition:**
- Baris masih ada di database
- File masih ada di storage
- Error pada RPC `_purgeDeletedContent`

---

### T4-D: Verifikasi Storage Object Count
**Langkah:**
1. Sebelum upload: catat jumlah object di Supabase Storage bucket `gallery`
2. Upload konten test (T4-A)
3. Soft delete → catat jumlah object (harus +1, file tetap ada)
4. Purge → catat jumlah object (harus kembali ke awal)

**Expected Result:**
- Before upload: N objects
- After upload: N+1 objects
- After soft delete: N+1 objects (file masih ada)
- After purge: N objects (file terhapus)

---

## TEST T5 — Image Compression Pipeline

**Prerequisite:** Login sebagai `anggota`. Siapkan gambar test > 500KB.

### T5-A: Upload dengan Kompresi
**Langkah:**
1. Buka Gallery > Upload Foto
2. Pilih gambar original yang berukuran besar (contoh: 2MB JPEG dari kamera)
3. Perhatikan preview thumbnail sebelum upload
4. Klik Upload
5. Setelah upload, buka URL gambar hasil dari Supabase Storage

**Expected Result:**
- Preview thumbnail muncul tanpa broken image
- Ukuran file yang tersimpan di storage < ukuran original
- Kualitas gambar tetap acceptable (tidak pixelated)
- Metadata type tetap `image/jpeg` atau `image/webp`

**Fail Condition:**
- Upload gagal dengan error "terlalu besar"
- File di storage sama persis ukurannya dengan original (kompresi tidak jalan)
- Broken image setelah upload

---

### T5-B: Batas Ukuran (10MB)
**Langkah:**
1. Siapkan file gambar > 10MB
2. Coba upload

**Expected Result:**
- Toast error muncul: "terlalu besar (X MB). Maks 10 MB."
- Upload tidak jadi
- Modal gallery tetap terbuka

**Fail Condition:**
- Upload berhasil padahal > 10MB
- Modal tertutup tanpa pesan error

---

### T5-C: Multiple Media (Maks 3)
**Langkah:**
1. Buka Gallery > Upload Foto
2. Tambah 3 foto sekaligus
3. Coba tambah foto ke-4

**Expected Result:**
- 3 thumbnail preview muncul tanpa broken image
- Foto ke-4 ditolak dengan toast "Maks 3 media per konten. 1 file diabaikan."
- Upload zone tersembunyi setelah 3 foto dipilih

**Fail Condition:**
- Lebih dari 3 foto bisa dipilih
- Thumbnail broken (ikon gambar rusak)
- Upload zone tidak tersembunyi

---

## TEST T6 — Realtime Notification

**Prerequisite:** 2 akun berbeda. Akun A = pembuat, Akun B = observer/moderator.

### T6-A: Notifikasi Content Pending
**Langkah:**
1. **Akun A:** Upload news/product/gallery baru
2. **Akun B:** Cek panel notifikasi (tab Personal)

**Expected Result (Akun B):**
- Notifikasi "konten baru pending approval" muncul dalam 5 detik
- Badge angka di ikon notifikasi bertambah
- Tab Personal aktif menampilkan notif yang benar

**Fail Condition:**
- Notifikasi tidak muncul setelah 10 detik
- Harus refresh halaman untuk melihat notifikasi

---

### T6-B: Notifikasi Approval / Rejection
**Langkah:**
1. **Akun B (moderator):** Approve atau reject konten dari Akun A
2. **Akun A:** Cek panel notifikasi

**Expected Result (Akun A):**
- Notifikasi `content_approved` atau `content_rejected` muncul dalam 5 detik
- Teks notifikasi menampilkan judul konten
- Reason (jika reject) tampil PENUH tanpa terpotong

**Fail Condition:**
- Akun A tidak menerima notifikasi
- Teks reason terpotong (ditunjukkan dengan "...")

---

### T6-C: Notifikasi Finance
**Langkah:**
1. **Akun dengan role finance:** Tambah transaksi baru
2. **Akun lain dengan akses finance:** Cek panel notifikasi tab Feed

**Expected Result:**
- Notifikasi transaksi muncul di tab Feed
- Nominal dan keterangan transaksi terlihat

---

### T6-D: Notifikasi Restore
**Langkah:**
1. **Admin:** Restore konten yang sudah di-soft-delete milik Akun A
2. **Akun A:** Cek panel notifikasi

**Expected Result:**
- Notifikasi `content_restored` muncul di tab Personal Akun A
- Konten kembali muncul di halaman publik

---

## TEST T7 — Gallery Pagination

**Prerequisite:** Gallery memiliki lebih dari 12 foto (1 page penuh).

### T7-A: Navigasi Halaman
**Langkah:**
1. Buka halaman Gallery
2. Perhatikan pagination bar di bawah grid
3. Klik tombol halaman ke-2
4. Klik tombol Previous/Next

**Expected Result:**
- Grid gallery berubah saat pindah halaman
- Tombol halaman aktif diberi highlight
- Scroll ke atas gallery secara otomatis
- Pagination info (misal "Halaman 2 dari 5") akurat

**Fail Condition:**
- Grid tidak berubah saat halaman dipilih
- Pagination bar tidak muncul
- Error di console saat pindah halaman

---

### T7-B: Pagination Tidak Reset ke API
**Langkah:**
1. Pindah ke halaman 3 gallery
2. Perhatikan apakah ada loading spinner

**Expected Result:**
- Tidak ada spinner (data sudah di-cache di `allGal`)
- Pergantian halaman instan (< 100ms)

**Fail Condition:**
- Muncul loading indicator saat pindah halaman
- API call baru ke Supabase setiap ganti halaman

---

## TEST T8 — Notification Tabs (Personal / Feed)

### T8-A: Visual Style Dark Theme
**Langkah:**
1. Klik ikon notifikasi (bell)
2. Perhatikan tampilan tab Personal dan Feed

**Expected Result:**
- Background tab TIDAK putih (sesuai ANJUNKU dark theme)
- Warna background: `rgba(0,0,0,0)` (transparan di atas panel gelap)
- Tab aktif: border-bottom hijau `rgb(57,255,20)`, teks hijau
- Tab tidak aktif: teks abu-abu, tanpa border

**Fail Condition:**
- Tab background putih / terang
- Tidak ada perbedaan visual antara tab aktif dan tidak aktif

---

### T8-B: Switch Tab Functionality
**Langkah:**
1. Buka panel notifikasi
2. Klik tab **Feed**
3. Klik tab **Personal**

**Expected Result:**
- Isi notifikasi berubah sesuai tab
- Feed: menampilkan update konten (news/gallery/product baru)
- Personal: menampilkan notifikasi personal (approval, reject, restore, finance)

**Fail Condition:**
- Tab tidak berganti konten
- Error di console saat switch tab

---

### T8-C: Responsive Mobile (390px)
**Langkah:**
1. Buka di browser mobile atau DevTools 390px width
2. Klik ikon notifikasi
3. Cek panel dan tab

**Expected Result:**
- Panel notifikasi tidak melebihi lebar layar
- Tab Personal/Feed masih terlihat dan bisa diklik
- Teks tidak overflow keluar panel

**Fail Condition:**
- Panel melampaui edge layar mobile
- Tab tidak terlihat / terpotong

---

## TEST T9 — Restore Notification

### T9-A: Restore Trigger Notifikasi
**Langkah:**
1. Admin lakukan restore konten milik user lain
2. Cek notifikasi di akun pemilik konten

**Expected Result:**
- Notifikasi type `content_restored` muncul
- Teks: "Konten Anda telah dipulihkan: [judul konten]"
- Muncul di tab Personal, bukan Feed

**Fail Condition:**
- Tidak ada notifikasi setelah restore
- Notifikasi muncul di tab yang salah (Feed)

---

### T9-B: Body Text Truncation (4 lines)
**Langkah:**
1. Pastikan ada notifikasi dengan body text panjang (> 4 baris)
2. Cek tampilan di panel notifikasi

**Expected Result:**
- Body text dipotong setelah 4 baris dengan "..."
- Title dipotong setelah 2 baris
- **Reason** tampil PENUH (tidak dipotong sama sekali)

**Fail Condition:**
- Body text tidak dipotong (overflow keluar panel)
- Reason terpotong dengan "..." atau `white-space: nowrap`

---

## TEST T10 — Ticker Soft Delete

**Prerequisite:** Login sebagai moderator atau admin.

### T10-A: Soft Delete Ticker
**Langkah:**
1. Buka admin panel > Ticker Management
2. Hapus salah satu ticker (soft delete)
3. Cek ticker bar di halaman utama

**Expected Result:**
- Ticker yang dihapus tidak muncul di ticker bar
- Ticker masih ada di database dengan `deleted_at` terisi
- Entry muncul di Storage Cleanup dengan bucket: `null` (ticker tidak punya storage)

**Fail Condition:**
- Ticker masih muncul di ticker bar setelah delete
- Error "bucket undefined" saat purge ticker

---

### T10-B: Restore Ticker
**Langkah:**
1. Dari admin panel, restore ticker yang sudah dihapus
2. Cek ticker bar

**Expected Result:**
- Ticker kembali muncul di ticker bar
- `deleted_at` menjadi NULL

**Fail Condition:**
- Ticker tidak kembali setelah restore
- RPC `restore_soft_deleted('tickers', id)` error

---

### T10-C: Purge Ticker (Tanpa Storage)
**Langkah:**
1. Soft delete ticker test
2. Jalankan purge pada tabel tickers

**Expected Result:**
- Baris terhapus dari database
- TIDAK ada error "Cannot delete storage file" (karena ticker tidak punya bucket)
- Log purge menampilkan "0 files deleted, 1 row deleted"

**Fail Condition:**
- Error saat purge karena mencoba akses null bucket
- Baris tidak terhapus setelah purge

---

## Checklist Akhir Sebelum Merge

| Test | Deskripsi | Status |
|---|---|---|
| T4-A | Soft delete menyimpan file di storage | ⬜ |
| T4-B | Restore mengembalikan konten | ⬜ |
| T4-C | Purge menghapus file dari storage | ⬜ |
| T4-D | Object count storage sesuai | ⬜ |
| T5-A | Kompresi gambar berjalan | ⬜ |
| T5-B | Batas 10MB ditolak | ⬜ |
| T5-C | Maks 3 foto per konten | ⬜ |
| T6-A | Notif pending realtime | ⬜ |
| T6-B | Notif approval/rejection realtime | ⬜ |
| T6-C | Notif finance realtime | ⬜ |
| T6-D | Notif restore realtime | ⬜ |
| T7-A | Navigasi halaman gallery | ⬜ |
| T7-B | Paginasi tidak re-fetch API | ⬜ |
| T8-A | Tab dark theme visual | ⬜ |
| T8-B | Switch tab functionality | ⬜ |
| T8-C | Responsive mobile 390px | ⬜ |
| T9-A | Restore trigger notif personal | ⬜ |
| T9-B | Body 4 lines, reason full | ⬜ |
| T10-A | Soft delete ticker | ⬜ |
| T10-B | Restore ticker | ⬜ |
| T10-C | Purge ticker tanpa error bucket | ⬜ |

**MERGE GATE: Semua ⬜ harus berubah jadi ✅ sebelum merge ke main.**
