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
  const lock = LockService.getScriptLock();
  try {
    // Tunggu hingga 30 detik untuk mendapatkan lock
    lock.waitLock(30000);
    
    var data = JSON.parse(e.postData.contents);
      
    // Jika request adalah untuk upload file
    if (data.action === 'uploadFile') {
      var folderId = '1UZkYGm-X4dKLfecVdPMZWd4lMUvHprHh'; // ID Folder Anda
      var folder = DriveApp.getFolderById(folderId);
                                  
      var contentType = data.mimeType || 'application/octet-stream';
      var bytes = Utilities.base64Decode(data.base64.split(',')[1]);
      var blob = Utilities.newBlob(bytes, contentType, data.filename);
                                                          
      var file = folder.createFile(blob);
      
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (e) {
        Logger.log("Gagal mengatur sharing: " + e.toString());
      }
                                                                            
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        url: file.getUrl(),
        downloadUrl: file.getDownloadUrl()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Aksi baru: Append Row (Menambah 1 baris saja tanpa menimpa seluruh sheet)
    if (data.action === 'appendRow') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const tableName = data.tableName;
      const record = data.record;
      
      if (!TABLES.includes(tableName)) {
        throw new Error("Table " + tableName + " not found in allowed list.");
      }
      
      const sheet = ss.getSheetByName(tableName) || ss.insertSheet(tableName);
      let headers = [];
      
      // Ambil header yang sudah ada
      if (sheet.getLastColumn() > 0) {
        headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      }
      
      // Jika sheet kosong atau header belum ada, buat header dari keys record
      if (headers.length === 0) {
        headers = Object.keys(record);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      } else {
        // Cek jika ada key baru di record yang belum ada di header
        const recordKeys = Object.keys(record);
        let headerUpdated = false;
        recordKeys.forEach(key => {
          if (!headers.includes(key)) {
            headers.push(key);
            headerUpdated = true;
          }
        });
        if (headerUpdated) {
          sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        }
      }
      
      // Siapkan baris data
      const row = headers.map(header => {
        let val = record[header];
        if (typeof val === 'object' && val !== null) {
          return JSON.stringify(val);
        }
        return val === undefined ? "" : val;
      });
      
      sheet.appendRow(row);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "appendRow" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Aksi baru: Append Multiple Rows
    if (data.action === 'appendMultiple') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const tableName = data.tableName;
      const records = data.records;
      
      if (!TABLES.includes(tableName)) {
        throw new Error("Table " + tableName + " not found in allowed list.");
      }
      
      const sheet = ss.getSheetByName(tableName) || ss.insertSheet(tableName);
      let headers = [];
      
      if (sheet.getLastColumn() > 0) {
        headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      }
      
      if (headers.length === 0 && records.length > 0) {
        headers = Object.keys(records[0]);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
      
      if (records.length > 0) {
        const rows = records.map(record => {
          return headers.map(header => {
            let val = record[header];
            if (typeof val === 'object' && val !== null) {
              return JSON.stringify(val);
            }
            return val === undefined ? "" : val;
          });
        });
        
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "appendMultiple" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Aksi baru: Update Row (Mencari ID dan mengupdate baris tersebut)
    if (data.action === 'updateRow') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const tableName = data.tableName;
      const record = data.record;
      const idField = data.idField || 'id';
      
      const sheet = ss.getSheetByName(tableName);
      if (!sheet) throw new Error("Sheet " + tableName + " not found.");
      
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      const idIndex = headers.indexOf(idField);
      
      if (idIndex === -1) throw new Error("ID field " + idField + " not found in headers.");
      
      let rowIndex = -1;
      for (let i = 1; i < values.length; i++) {
        if (values[i][idIndex] == record[idField]) {
          rowIndex = i + 1;
          break;
        }
      }
      
      if (rowIndex === -1) {
        // Jika tidak ketemu, anggap sebagai append
        return doPost({ postData: { contents: JSON.stringify({ action: 'appendRow', tableName, record }) } });
      }
      
      // Update baris
      const row = headers.map(header => {
        let val = record[header];
        if (typeof val === 'object' && val !== null) {
          return JSON.stringify(val);
        }
        return val === undefined ? "" : val;
      });
      
      sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "updateRow" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Aksi baru: Delete Row
    if (data.action === 'deleteRow') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const tableName = data.tableName;
      const idValue = data.idValue;
      const idField = data.idField || 'id';
      
      const sheet = ss.getSheetByName(tableName);
      if (!sheet) throw new Error("Sheet " + tableName + " not found.");
      
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      const idIndex = headers.indexOf(idField);
      
      if (idIndex === -1) throw new Error("ID field " + idField + " not found in headers.");
      
      for (let i = values.length - 1; i >= 1; i--) {
        if (values[i][idIndex] == idValue) {
          sheet.deleteRow(i + 1);
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "deleteRow" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Aksi baru: Save Table (Menimpa satu sheet saja)
    if (data.action === 'saveTable') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const tableName = data.tableName;
      const tableData = data.data;
      
      if (!TABLES.includes(tableName)) {
        throw new Error("Table " + tableName + " not found in allowed list.");
      }
      
      const sheet = ss.getSheetByName(tableName) || ss.insertSheet(tableName);
      sheet.clear();
      
      if (Array.isArray(tableData) && tableData.length > 0) {
        if (typeof tableData[0] === 'string') {
          sheet.getRange(1, 1).setValue("value");
          const rows = tableData.map(item => [item]);
          if(rows.length > 0) sheet.getRange(2, 1, rows.length, 1).setValues(rows);
        } 
        else {
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
              if (typeof val === 'object' && val !== null) {
                return JSON.stringify(val);
              }
              return val === undefined ? "" : val;
            });
          });
          
          if(rows.length > 0) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
        }
      }
      else if (typeof tableData === 'object' && tableData !== null) {
        const headers = Object.keys(tableData);
        if(headers.length > 0) {
          sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
          const row = headers.map(header => {
            let val = tableData[header];
            if (typeof val === 'object' && val !== null) {
              return JSON.stringify(val);
            }
            return val === undefined ? "" : val;
          });
          sheet.getRange(2, 1, 1, headers.length).setValues([row]);
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "saveTable" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const requestData = data; // Full save mode
    
    // Loop setiap key di JSON (units, tenants, dll)
    Object.keys(requestData).forEach(tableName => {
      if (TABLES.includes(tableName)) {
        const sheet = ss.getSheetByName(tableName) || ss.insertSheet(tableName);
        const tableData = requestData[tableName];
        
        sheet.clear(); // Bersihkan data lama
        
        if (Array.isArray(tableData) && tableData.length > 0) {
          if (typeof tableData[0] === 'string') {
            sheet.getRange(1, 1).setValue("value");
            const rows = tableData.map(item => [item]);
            if(rows.length > 0) sheet.getRange(2, 1, rows.length, 1).setValues(rows);
          } 
          else {
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
                if (typeof val === 'object' && val !== null) {
                  return JSON.stringify(val);
                }
                return val === undefined ? "" : val;
              });
            });
            
            if(rows.length > 0) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
          }
        } 
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
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "fullSave" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
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
