// Daftar tabel/sheet yang akan dibuat
const TABLES = [
  'units', 'tenants', 'payments', 'expenses', 'otherIncomes', 
  'walletTransactions', 'areas', 'expenseCategories', 'users', 
  'bookClosings', 'dividendRecipients', 'settings', 'logs' // Menambahkan 'logs' agar riwayat aktivitas tersimpan
];

// Fungsi untuk inisialisasi sheet dan header
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Hapus sheet "Database" lama jika ada
  const oldSheet = ss.getSheetByName("Database");
  if (oldSheet) {
    // Jangan dihapus dulu jika ada datanya, biarkan saja sebagai backup
    oldSheet.setName("Database_Backup_JSON"); 
  }

  TABLES.forEach(tableName => {
    let sheet = ss.getSheetByName(tableName);
    if (!sheet) {
      sheet = ss.insertSheet(tableName);
      // Header default (akan diupdate otomatis saat ada data masuk)
      sheet.getRange("A1").setValue("DATA_JSON_STRINGIFIED"); 
    }
  });
}

// Mengambil data dari semua sheet dan menggabungkannya jadi 1 JSON
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = {};

  TABLES.forEach(tableName => {
    const sheet = ss.getSheetByName(tableName);
    if (sheet) {
      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();
      
      if (values.length > 1) {
        const headers = values[0];
        const rows = [];
        
        for (let i = 1; i < values.length; i++) {
          const rowData = {};
          let isEmptyRow = true;
          
          for (let j = 0; j < headers.length; j++) {
            let cellValue = values[i][j];
            if (cellValue !== "") {
              isEmptyRow = false;
              // Coba parse jika bentuknya stringified JSON (array/object)
              try {
                if (typeof cellValue === 'string' && (cellValue.startsWith('{') || cellValue.startsWith('['))) {
                  cellValue = JSON.parse(cellValue);
                }
              } catch(e) {}
              rowData[headers[j]] = cellValue;
            }
          }
          if (!isEmptyRow) rows.push(rowData);
        }
        
        // Untuk array string sederhana (areas, expenseCategories)
        if (['areas', 'expenseCategories'].includes(tableName)) {
           result[tableName] = rows.map(r => r.name || r.value || Object.values(r)[0]);
        } 
        // Untuk settings (object tunggal)
        else if (tableName === 'settings') {
           result[tableName] = rows.length > 0 ? rows[0] : {};
        } 
        else {
          result[tableName] = rows;
        }
      } else {
        // Sheet kosong
        result[tableName] = ['areas', 'expenseCategories'].includes(tableName) ? [] : (tableName === 'settings' ? {} : []);
      }
    }
  });

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Menyimpan data dari React ke masing-masing sheet
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
      
    // Jika request adalah untuk upload file
    if (data.action === 'uploadFile') {
      var folderId = '1UZkYGm-X4dKLfecVdPMZWd4lMUvHprHh'; // ID Folder Anda
      var folder = DriveApp.getFolderById(folderId);
                                  
      var contentType = data.mimeType || 'application/octet-stream';
      var bytes = Utilities.base64Decode(data.base64.split(',')[1]);
      var blob = Utilities.newBlob(bytes, contentType, data.filename);
                                                          
      var file = folder.createFile(blob);
      
      // Bungkus pengaturan sharing dengan try-catch agar tidak error jika fitur sharing dibatasi
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (e) {
        Logger.log("Gagal mengatur sharing: " + e.toString());
        // Tetap lanjut meskipun sharing gagal
      }
                                                                            
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        url: file.getUrl(),
        downloadUrl: file.getDownloadUrl()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const requestData = JSON.parse(e.postData.contents);
    
    // Loop setiap key di JSON (units, tenants, dll)
    Object.keys(requestData).forEach(tableName => {
      if (TABLES.includes(tableName)) {
        const sheet = ss.getSheetByName(tableName) || ss.insertSheet(tableName);
        const tableData = requestData[tableName];
        
        sheet.clear(); // Bersihkan data lama
        
        if (Array.isArray(tableData) && tableData.length > 0) {
          // Jika array of string (areas, expenseCategories)
          if (typeof tableData[0] === 'string') {
            sheet.getRange(1, 1).setValue("value");
            const rows = tableData.map(item => [item]);
            if(rows.length > 0) sheet.getRange(2, 1, rows.length, 1).setValues(rows);
          } 
          // Jika array of object (units, tenants, dll)
          else {
            // Ambil semua unique keys untuk header
            let headers = [];
            tableData.forEach(obj => {
              Object.keys(obj).forEach(key => {
                if (!headers.includes(key)) headers.push(key);
              });
            });
            
            sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
            
            const rows = tableData.map(obj => {
              return headers.map(header => {
                let val = obj[header];
                // Jika value berupa object/array bersarang, jadikan string
                if (typeof val === 'object' && val !== null) {
                  return JSON.stringify(val);
                }
                return val === undefined ? "" : val;
              });
            });
            
            if(rows.length > 0) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
          }
        } 
        // Jika object tunggal (settings)
        else if (typeof tableData === 'object' && tableData !== null && !Array.isArray(tableData)) {
           const headers = Object.keys(tableData);
           if(headers.length > 0) {
             sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
             const row = headers.map(header => tableData[header]);
             sheet.getRange(2, 1, 1, headers.length).setValues([row]);
           }
        }
      }
    });
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Fungsi ini HANYA untuk memancing pop-up izin otorisasi Google Drive & Spreadsheet
function testAuth() {
  var folder = DriveApp.getFolderById('1UZkYGm-X4dKLfecVdPMZWd4lMUvHprHh');
  // Baris di bawah ini akan memaksa Google meminta izin "Menulis" ke Drive Anda
  var tempFile = folder.createFile('test_izin.txt', 'tes');
  tempFile.setTrashed(true); // Langsung hapus file tesnya
  
  Logger.log("Otorisasi Drive (Baca & Tulis) berhasil diberikan!");
}
