
import { AppData, RentalUnit, UnitStatus } from '../types';

const STORAGE_KEY = 'kontrakan_data_v1';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzeMFUuFX6qaGiGvl25HrpL7VJoab5eRqg4vOvMRYxHrHeL9yb86tmmDdKS2gGHp3Nm/exec';

const initialData: AppData = {
  units: [
    { id: '1', name: 'Pintu A1', area: 'Blok Barat', monthlyPrice: 1200000, status: UnitStatus.OCCUPIED },
    { id: '2', name: 'Pintu A2', area: 'Blok Barat', monthlyPrice: 1200000, status: UnitStatus.OCCUPIED },
    { id: '3', name: 'Pintu B1', area: 'Blok Timur', monthlyPrice: 1500000, status: UnitStatus.VACANT },
    { id: '4', name: 'Pintu B2', area: 'Blok Timur', monthlyPrice: 1500000, status: UnitStatus.OCCUPIED },
  ],
  tenants: [
    { id: 't1', name: 'Budi Santoso', unitId: '1', moveInDate: '2023-10-01', dueDay: 8, contact: '08123456789' },
    { id: 't2', name: 'Siti Aminah', unitId: '2', moveInDate: '2023-11-15', dueDay: 22, contact: '08129876543' },
    { id: 't3', name: 'Rahmat Hidayat', unitId: '4', moveInDate: '2024-01-05', dueDay: 12, contact: '081333444555' },
  ],
  payments: [
    { id: 'p1', tenantId: 't1', unitId: '1', amount: 1200000, date: '2024-01-08', periodCovered: 'Januari 2024', notes: 'Lunas', isInstallment: false, createdAt: '2024-01-08T10:00:00.000Z' },
    { id: 'p2', tenantId: 't2', unitId: '2', amount: 600000, date: '2024-01-22', periodCovered: 'Januari 2024', notes: 'Cicilan 1', isInstallment: true, createdAt: '2024-01-22T14:30:00.000Z' },
  ],
  expenses: [],
  areas: ['Blok Barat', 'Blok Timur'],
  expenseCategories: ['Listrik', 'Air', 'Perbaikan', 'Kebersihan', 'Lainnya'],
  users: [
    { username: 'admin', pin: '1234', role: 'admin' }
  ]
};

export const loadData = async (): Promise<AppData> => {
  try {
    const response = await fetch(GAS_URL);
    const data = await response.json();
    
    if (!data || Object.keys(data).length === 0) {
      console.log('GAS data is empty, initializing with default data');
      await saveData(initialData);
      return initialData;
    }
    
    let needsSync = false;
    
    // Migrations
    if (!data.areas || data.areas.length === 0) {
      data.areas = Array.from(new Set((data.units || []).map((u: RentalUnit) => u.area)));
      needsSync = true;
    }
    if (!data.expenses) {
      data.expenses = [];
      needsSync = true;
    }
    if (!data.expenseCategories || data.expenseCategories.length === 0) {
      data.expenseCategories = ['Listrik', 'Air', 'Perbaikan', 'Kebersihan', 'Lainnya'];
      needsSync = true;
    }
    if (!data.users || data.users.length === 0) {
      data.users = [{ username: 'admin', pin: '1234', role: 'admin' }];
      needsSync = true;
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    
    // Jika ada data default yang baru ditambahkan (karena di GAS kosong), langsung push ke GAS
    if (needsSync) {
      console.log('Syncing default data to GAS...');
      saveData(data);
    }
    
    return data as AppData;
  } catch (error) {
    console.error('Error loading data from GAS, falling back to local storage:', error);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      saveData(initialData);
      return initialData;
    }
    const parsed = JSON.parse(stored);
    return parsed;
  }
};

export const saveData = async (data: AppData): Promise<void> => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error('Error saving data to GAS:', error);
  }
};

export const uploadFileToGAS = async (base64Data: string, filename: string, mimeType: string): Promise<string | null> => {
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'uploadFile',
        base64: base64Data,
        filename: filename,
        mimeType: mimeType
      }),
    });
    
    const result = await response.json();
    if (result.success && result.url) {
      return result.url;
    } else {
      console.error('GAS Upload Error Details:', result);
      if (result.error) {
        // Jika error mengandung kata "permission" atau "DriveApp", berarti otorisasi belum beres
        if (result.error.includes('DriveApp') || result.error.includes('permission')) {
          alert('Error Otorisasi: Pastikan Anda sudah melakukan "Redeploy" sebagai "Versi Baru" di Google Apps Script.');
        }
      }
      return null;
    }
  } catch (error) {
    console.error('Network/CORS Error uploading to GAS:', error);
    return null;
  }
};
