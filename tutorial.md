# Tutorial Penggunaan Aplikasi Manajemen Kos

## 1. Role Pengguna (User Roles)
Aplikasi ini memiliki 4 jenis role pengguna dengan hak akses yang berbeda-beda:

### a. Admin
- **Hak Akses:** Penuh (Full Access).
- **Fungsi:** Dapat melihat, menambah, mengubah, dan menghapus semua data di seluruh wilayah. Admin juga dapat mengelola pengguna lain (User Management), mengatur persentase alokasi laba (Kas & Tabungan), dan melakukan Tutup Buku bulanan.

### b. Accountant (Akuntan)
- **Hak Akses:** Terbatas pada mode Akuntansi (Accounting Mode).
- **Fungsi:** Dapat melihat semua laporan keuangan, riwayat transaksi, dan melakukan Tutup Buku bulanan. Tidak dapat menambah atau mengubah data operasional (seperti unit, penyewa, pembayaran sewa harian).

### c. User (Pengelola Wilayah)
- **Hak Akses:** Terbatas pada wilayah (area) yang ditugaskan kepadanya.
- **Fungsi:** Dapat mengelola unit, penyewa, mencatat pembayaran sewa, dan pengeluaran **hanya** untuk wilayah yang menjadi tanggung jawabnya. Tidak dapat melihat data wilayah lain atau melakukan pengaturan sistem.

### d. Viewer (Pemantau)
- **Hak Akses:** Hanya melihat (Read-only).
- **Fungsi:** Dapat melihat data dashboard, daftar unit, penyewa, dan laporan, tetapi tidak dapat melakukan perubahan data apapun (tidak bisa menambah, mengedit, atau menghapus).

---

## 2. Menu Utama dan Penggunaannya

Aplikasi ini dibagi menjadi dua mode utama: **Mode Transaksi** (untuk operasional sehari-hari) dan **Mode Pembukuan** (untuk rekap keuangan bulanan).

### A. Mode Transaksi (Operasional)

#### 1. Dashboard
- **Fungsi:** Menampilkan ringkasan singkat seperti total pendapatan bulan ini, total pengeluaran, jumlah unit terisi/kosong, dan grafik tren keuangan.
- **Cara Penggunaan:** Buka menu ini untuk melihat kondisi terkini bisnis kos Anda secara sekilas.

#### 2. Wilayah & Unit
- **Fungsi:** Mengelola daftar lokasi kos (Wilayah) dan kamar-kamar di dalamnya (Unit).
- **Cara Penggunaan:**
  - **Admin:** Dapat menambah wilayah baru dan unit baru di semua wilayah.
  - **User:** Hanya dapat melihat dan mengelola unit di wilayahnya.
  - Klik tombol "Tambah Unit" untuk memasukkan kamar baru beserta harga sewanya.

#### 3. Penyewa
- **Fungsi:** Mengelola data orang yang menyewa kamar.
- **Cara Penggunaan:**
  - Klik "Tambah Penyewa", pilih unit yang kosong, masukkan nama, kontak, dan unggah foto identitas (KTP).
  - Anda bisa melihat riwayat penyewa sebelumnya di unit tertentu melalui tombol "Riwayat Penyewa".

#### 4. Transaksi (Pemasukan & Pengeluaran)
- **Fungsi:** Mencatat uang masuk (pembayaran sewa) dan uang keluar (biaya operasional).
- **Cara Penggunaan:**
  - **Catat Pembayaran:** Klik tombol "Pembayaran", pilih penyewa, masukkan jumlah uang, dan pilih periode bulan yang dibayar. Anda juga bisa mengunggah bukti transfer.
  - **Catat Pengeluaran:** Klik tombol "Pengeluaran", pilih kategori (misal: Listrik, Air, Perbaikan), masukkan jumlah, dan pilih wilayah terkait (jika ada).

#### 5. Laporan
- **Fungsi:** Menampilkan tabel rincian semua transaksi yang terjadi dalam rentang waktu tertentu.
- **Cara Penggunaan:** Gunakan filter bulan dan tahun untuk melihat riwayat transaksi. Anda bisa mengekspor data ini jika diperlukan.

#### 6. Riwayat Aktivitas (Logs)
- **Fungsi:** Melacak siapa melakukan apa di dalam aplikasi (Audit Trail).
- **Cara Penggunaan:** Buka menu ini untuk melihat log detail seperti "Admin menambahkan pembayaran sewa Rp 1.500.000 dari Budi".

---

### B. Mode Pembukuan (Accounting)

Mode ini khusus untuk merekap keuangan di akhir bulan dan membagikan laba.

#### 1. Ringkasan Keuangan
- **Fungsi:** Melihat total uang yang terkumpul di berbagai "Dompet" (Kas, Tabungan, Zakat, Dividen).
- **Cara Penggunaan:** Pantau saldo masing-masing dompet. Anda juga bisa mencatat transaksi manual antar dompet (misal: penarikan kas) melalui tombol "Transaksi Dompet".

#### 2. Pemasukan Lain-lain
- **Fungsi:** Mencatat pendapatan di luar uang sewa kamar (misal: denda keterlambatan, penjualan aset bekas).
- **Cara Penggunaan:** Klik "Catat Pemasukan Lain", masukkan deskripsi dan jumlahnya. Anda bisa memilih apakah uang ini akan dialokasikan sesuai persentase (Kas/Tabungan/Zakat/Dividen) atau langsung masuk 100% ke Dividen.

#### 3. Tutup Buku Bulanan
- **Fungsi:** Menghitung laba bersih bulan ini, membaginya ke berbagai pos (Kas, Tabungan, Zakat, Dividen), dan mengarsipkan transaksi agar bulan depan dimulai dari nol lagi.
- **Cara Penggunaan (Hanya Admin/Accountant):**
  - Pastikan semua transaksi bulan ini sudah dicatat.
  - Buka tab "Tutup Buku". Sistem akan otomatis menghitung total pendapatan dan pengeluaran.
  - Klik "Tutup Buku Periode Ini".
  - Transaksi bulan tersebut akan dipindahkan ke "Riwayat Tutup Buku" dan saldo dompet akan diperbarui.

#### 4. Riwayat Tutup Buku
- **Fungsi:** Melihat arsip laporan keuangan bulan-bulan sebelumnya.
- **Cara Penggunaan:** Klik pada salah satu bulan untuk melihat detail pendapatannya, pengeluarannya, dan rincian pembagian dividen kepada para investor. Anda juga bisa mengunduh laporan ini dalam format PDF.

#### 5. Pengaturan Alokasi (Hanya Admin)
- **Fungsi:** Mengatur persentase pembagian laba bersih.
- **Cara Penggunaan:**
  - Tentukan berapa persen laba yang masuk ke Kas (untuk operasional bulan depan) dan Tabungan (untuk dana darurat/pengembangan).
  - Zakat otomatis dihitung 2.5%.
  - Sisanya otomatis menjadi Dividen (Laba Bersih yang dibagikan ke pemilik/investor).
  - Anda juga bisa mendaftarkan nama-nama penerima dividen beserta persentase bagian (saham) mereka masing-masing.

---

## 3. Alur Kerja (Workflow) Umum

1. **Awal Bulan:**
   - **User/Admin:** Mencatat pembayaran sewa dari penyewa yang memperpanjang sewa.
   - **User/Admin:** Mencatat pengeluaran rutin (bayar listrik, air, sampah).
2. **Pertengahan Bulan:**
   - **User/Admin:** Menambah penyewa baru jika ada kamar kosong.
   - **User/Admin:** Mencatat pengeluaran insidental (perbaikan keran bocor, dll).
3. **Akhir Bulan:**
   - **Admin/Accountant:** Memeriksa kembali semua transaksi di menu Laporan.
   - **Admin/Accountant:** Mencatat Pemasukan Lain-lain (jika ada).
   - **Admin/Accountant:** Melakukan **Tutup Buku**.
   - **Admin/Accountant:** Mengunduh PDF Laporan Tutup Buku dan membagikan dividen kepada investor sesuai rincian yang tertera.
