
import { 
  VehicleEntry, AppSettings, UserSession, ImportOrigin, 
  WorkShift, BreakfastRecord, PackageRecord, Meter, 
  MeterReading, ShiftBackupPayload, AppLog, PatrolRecord 
} from '../types';
import { STORAGE_KEYS } from '../constants';

// Chave para fila de exclusão
const DELETED_QUEUE_KEY = 'portaria_express_deleted_queue';

interface DeletedItem {
  id: string;
  table: string; // nome da tabela no Supabase
  timestamp: string;
}

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export const db = {
  // --- AUXILIARES DE SINCRONIZAÇÃO BIDIRECIONAL ---
  
  // Mescla dados vindos da nuvem com os locais sem duplicar
  upsertFromCloud: <T extends { id: string, synced?: boolean }>(key: string, cloudItems: T[]) => {
    try {
      const localDataStr = localStorage.getItem(key);
      let localList: T[] = localDataStr ? JSON.parse(localDataStr) : [];
      const localIds = new Set(localList.map(item => item.id));
      
      let addedCount = 0;
      let updatedCount = 0;

      cloudItems.forEach(cloudItem => {
        const itemToStore = { ...cloudItem, synced: true };
        if (localIds.has(cloudItem.id)) {
          // Se já existe, atualizamos se o local estiver marcado como sincronizado
          // (Para não sobrescrever mudanças locais pendentes de envio)
          const index = localList.findIndex(i => i.id === cloudItem.id);
          if (localList[index].synced) {
            localList[index] = itemToStore;
            updatedCount++;
          }
        } else {
          localList.push(itemToStore);
          addedCount++;
        }
      });

      if (addedCount > 0 || updatedCount > 0) {
        localStorage.setItem(key, JSON.stringify(localList));
      }
      return { added: addedCount, updated: updatedCount };
    } catch (e) {
      console.error(`Erro ao fazer upsert cloud em ${key}`, e);
      return { added: 0, updated: 0 };
    }
  },

  markForDeletion: (id: string, table: string) => {
    const queue: DeletedItem[] = JSON.parse(localStorage.getItem(DELETED_QUEUE_KEY) || '[]');
    queue.push({ id, table, timestamp: new Date().toISOString() });
    localStorage.setItem(DELETED_QUEUE_KEY, JSON.stringify(queue));
  },

  getDeletedQueue: (): DeletedItem[] => {
    return JSON.parse(localStorage.getItem(DELETED_QUEUE_KEY) || '[]');
  },

  clearDeletedQueue: (idsToRemove: string[]) => {
    let queue: DeletedItem[] = JSON.parse(localStorage.getItem(DELETED_QUEUE_KEY) || '[]');
    queue = queue.filter(item => !idsToRemove.includes(item.id));
    localStorage.setItem(DELETED_QUEUE_KEY, JSON.stringify(queue));
  },

  markAsSynced: (key: string, ids: string[]) => {
    try {
      const dataStr = localStorage.getItem(key);
      if (!dataStr) return;
      const list = JSON.parse(dataStr);
      const updatedList = list.map((item: any) => {
        if (ids.includes(item.id)) {
          return { ...item, synced: true };
        }
        return item;
      });
      localStorage.setItem(key, JSON.stringify(updatedList));
    } catch (e) {
      console.error(`Erro ao marcar sync em ${key}`, e);
    }
  },

  getUnsyncedItems: <T>(key: string): T[] => {
    try {
      const dataStr = localStorage.getItem(key);
      if (!dataStr) return [];
      const list = JSON.parse(dataStr);
      return list.filter((item: any) => item.synced !== true);
    } catch (e) {
      return [];
    }
  },

  // --- GESTÃO DE SESSÃO ---
  getSession: (): UserSession | null => {
    const data = localStorage.getItem(STORAGE_KEYS.SESSION);
    return data ? JSON.parse(data) : null;
  },
  saveSession: (session: UserSession) => {
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
  },
  clearSession: () => {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
  },

  // --- LOGS ---
  getLogs: (): AppLog[] => {
    const data = localStorage.getItem(STORAGE_KEYS.LOGS);
    return data ? JSON.parse(data) : [];
  },
  saveLogs: (logs: AppLog[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
    } catch (e) {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs.slice(-500)));
    }
  },
  addLog: (module: AppLog['module'], action: string, refId?: string, details?: string) => {
    const logs = db.getLogs();
    const session = db.getSession();
    const now = new Date().toISOString();
    const newLog: AppLog = {
      id: generateUUID(),
      timestamp: now,
      user: session?.operatorName || "Desconhecido",
      module,
      action,
      referenceId: refId,
      details,
      synced: false,
      created_at: now,
      updated_at: now
    };
    logs.push(newLog);
    db.saveLogs(logs.slice(-2000));
  },

  // --- RONDAS ---
  getPatrols: (): PatrolRecord[] => {
    const data = localStorage.getItem(STORAGE_KEYS.PATROLS);
    return data ? JSON.parse(data) : [];
  },
  savePatrols: (list: PatrolRecord[]) => {
    localStorage.setItem(STORAGE_KEYS.PATROLS, JSON.stringify(list));
  },
  addPatrol: (patrol: PatrolRecord) => {
    const list = db.getPatrols();
    const now = new Date().toISOString();
    const newPatrol = {
      ...patrol,
      id: patrol.id || generateUUID(),
      synced: false,
      created_at: patrol.created_at || now,
      updated_at: now
    };
    list.push(newPatrol);
    db.savePatrols(list);
    db.addLog('Rondas', 'Iniciou nova ronda', newPatrol.id, `Porteiro: ${newPatrol.porteiro}`);
  },
  updatePatrol: (updated: PatrolRecord) => {
    const list = db.getPatrols();
    const index = list.findIndex(p => p.id === updated.id);
    if (index !== -1) {
      list[index] = { ...updated, synced: false, updated_at: new Date().toISOString() };
      db.savePatrols(list);
      if (updated.status === 'CONCLUIDA') {
        db.addLog('Rondas', 'Finalizou ronda', updated.id, `Duração: ${updated.duracaoMinutos} min`);
      }
    }
  },
  deletePatrol: (id: string) => {
    const list = db.getPatrols();
    db.savePatrols(list.filter(p => p.id !== id));
    db.markForDeletion(id, 'patrols');
    db.addLog('Rondas', 'Excluiu registro de ronda', id);
  },

  // --- BACKUP ---
  exportCompleteBackup: (): string => {
    const session = db.getSession();
    const payload: ShiftBackupPayload = {
      versao: "1.0",
      dataExportacao: new Date().toISOString(),
      geradoPor: session?.operatorName || "Porteiro",
      dados: {
        cafe: db.getBreakfastList(),
        encomendas: db.getPackages(),
        entradas: db.getEntries(),
        medidores: db.getMeters(),
        leituras: db.getReadings(),
        expediente: db.getShifts(),
        rondas: db.getPatrols(),
        logs: db.getLogs()
      }
    };
    return JSON.stringify(payload);
  },

  importCompleteBackup: (jsonStr: string) => {
    const payload: ShiftBackupPayload = JSON.parse(jsonStr);
    localStorage.setItem(STORAGE_KEYS.BREAKFAST, JSON.stringify(payload.dados.cafe || []));
    localStorage.setItem(STORAGE_KEYS.PACKAGES, JSON.stringify(payload.dados.encomendas || []));
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(payload.dados.entradas || []));
    localStorage.setItem(STORAGE_KEYS.METERS, JSON.stringify(payload.dados.medidores || []));
    localStorage.setItem(STORAGE_KEYS.METER_READINGS, JSON.stringify(payload.dados.leituras || []));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(payload.dados.expediente || []));
    localStorage.setItem(STORAGE_KEYS.PATROLS, JSON.stringify(payload.dados.rondas || []));
    db.addLog('Sistema', 'Importação de Backup Total');
    return true;
  },

  // --- MEDIDORES ---
  getMeters: (): Meter[] => {
    const data = localStorage.getItem(STORAGE_KEYS.METERS);
    return data ? JSON.parse(data) : [];
  },
  saveMeters: (list: Meter[]) => {
    localStorage.setItem(STORAGE_KEYS.METERS, JSON.stringify(list));
  },
  addMeter: (meter: Meter) => {
    const list = db.getMeters();
    const now = new Date().toISOString();
    const newMeter = {
      ...meter,
      id: meter.id || generateUUID(),
      synced: false,
      created_at: meter.created_at || now,
      updated_at: now
    };
    list.push(newMeter);
    db.saveMeters(list);
    db.addLog('Medidores', 'Novo Medidor', newMeter.id, newMeter.name);
  },
  deleteMeter: (id: string) => {
    const list = db.getMeters();
    db.saveMeters(list.filter(m => m.id !== id));
    db.markForDeletion(id, 'meters');
  },

  // --- LEITURAS ---
  getReadings: (): MeterReading[] => {
    const data = localStorage.getItem(STORAGE_KEYS.METER_READINGS);
    return data ? JSON.parse(data) : [];
  },
  saveReadings: (list: MeterReading[]) => {
    localStorage.setItem(STORAGE_KEYS.METER_READINGS, JSON.stringify(list));
  },
  addReading: (reading: MeterReading) => {
    const list = db.getReadings();
    const now = new Date().toISOString();
    const newReading = {
      ...reading,
      id: reading.id || generateUUID(),
      synced: false,
      created_at: reading.created_at || now,
      updated_at: now
    };
    list.push(newReading);
    db.saveReadings(list);
    db.addLog('Medidores', 'Nova Leitura', newReading.meterId);
  },
  getReadingsByMeter: (meterId: string): MeterReading[] => {
    return db.getReadings().filter(r => r.meterId === meterId).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  // --- CAFÉ ---
  getBreakfastList: (): BreakfastRecord[] => {
    const data = localStorage.getItem(STORAGE_KEYS.BREAKFAST);
    return data ? JSON.parse(data) : [];
  },
  saveBreakfastList: (list: BreakfastRecord[]) => {
    localStorage.setItem(STORAGE_KEYS.BREAKFAST, JSON.stringify(list));
  },
  markBreakfastDelivered: (id: string, operatorName: string) => {
    const list = db.getBreakfastList();
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      list[index].status = 'Entregue';
      list[index].deliveredAt = new Date().toISOString();
      list[index].operatorName = operatorName;
      list[index].synced = false;
      list[index].updated_at = new Date().toISOString();
      db.saveBreakfastList(list);
    }
  },
  addBreakfastPerson: (person: BreakfastRecord) => {
    const list = db.getBreakfastList();
    const now = new Date().toISOString();
    const newPerson = {
      ...person,
      id: person.id || generateUUID(),
      synced: false,
      created_at: person.created_at || now,
      updated_at: now
    };
    list.push(newPerson);
    db.saveBreakfastList(list);
  },
  clearBreakfastByDate: (date: string) => {
    const list = db.getBreakfastList();
    const toRemove = list.filter(item => item.date === date);
    db.saveBreakfastList(list.filter(item => item.date !== date));
    toRemove.forEach(item => db.markForDeletion(item.id, 'breakfast_list'));
  },

  // --- ENCOMENDAS ---
  getPackages: (): PackageRecord[] => {
    const data = localStorage.getItem(STORAGE_KEYS.PACKAGES);
    return data ? JSON.parse(data) : [];
  },
  savePackages: (list: PackageRecord[]) => {
    localStorage.setItem(STORAGE_KEYS.PACKAGES, JSON.stringify(list));
  },
  addPackage: (record: PackageRecord) => {
    const list = db.getPackages();
    const now = new Date().toISOString();
    const newPkg = { ...record, id: record.id || generateUUID(), synced: false, created_at: now, updated_at: now };
    list.push(newPkg);
    db.savePackages(list);
  },
  updatePackage: (updated: PackageRecord) => {
    const list = db.getPackages();
    const index = list.findIndex(p => p.id === updated.id);
    if (index !== -1) {
      list[index] = { ...updated, synced: false, updated_at: new Date().toISOString() };
      db.savePackages(list);
    }
  },
  deletePackage: (id: string) => {
    const list = db.getPackages();
    db.savePackages(list.filter(p => p.id !== id));
    db.markForDeletion(id, 'packages');
  },

  // --- PORTARIA ---
  getEntries: (): VehicleEntry[] => {
    const data = localStorage.getItem(STORAGE_KEYS.ENTRIES);
    return data ? JSON.parse(data) : [];
  },
  saveEntries: (entries: VehicleEntry[]) => {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
  },
  addEntry: (entry: VehicleEntry) => {
    const entries = db.getEntries();
    const now = new Date().toISOString();
    const newEntry = { ...entry, id: entry.id || generateUUID(), synced: false, created_at: now, updated_at: now };
    entries.push(newEntry);
    db.saveEntries(entries);
  },
  updateEntry: (updatedEntry: VehicleEntry) => {
    const entries = db.getEntries();
    const index = entries.findIndex(e => e.id === updatedEntry.id);
    if (index !== -1) {
      entries[index] = { ...updatedEntry, synced: false, updated_at: new Date().toISOString() };
      db.saveEntries(entries);
    }
  },

  deleteProfileEntries: (name: string, plate: string) => {
    const entries = db.getEntries();
    const toRemove = entries.filter(e => e.driverName.toLowerCase() === name.toLowerCase() && (e.vehiclePlate || '').toLowerCase() === plate.toLowerCase());
    db.saveEntries(entries.filter(e => !(e.driverName.toLowerCase() === name.toLowerCase() && (e.vehiclePlate || '').toLowerCase() === plate.toLowerCase())));
    toRemove.forEach(e => db.markForDeletion(e.id, 'vehicle_entries'));
  },

  updateProfileEntries: (oldName: string, oldPlate: string, updates: Partial<VehicleEntry>) => {
    const entries = db.getEntries();
    const now = new Date().toISOString();
    const updated = entries.map(e => {
      if (e.driverName.toLowerCase() === oldName.toLowerCase() && (e.vehiclePlate || '').toLowerCase() === oldPlate.toLowerCase()) {
        return { ...e, ...updates, synced: false, updated_at: now };
      }
      return e;
    });
    db.saveEntries(updated);
  },

  // --- PONTO ---
  getShifts: (): WorkShift[] => {
    const data = localStorage.getItem(STORAGE_KEYS.SHIFTS);
    return data ? JSON.parse(data) : [];
  },
  saveShifts: (shifts: WorkShift[]) => {
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
  },
  updateShift: (updatedShift: WorkShift) => {
    const shifts = db.getShifts();
    const now = new Date().toISOString();
    const index = shifts.findIndex(s => s.id === updatedShift.id);
    if (index !== -1) {
      shifts[index] = { ...updatedShift, synced: false, updated_at: now };
    } else {
      shifts.push({ ...updatedShift, id: updatedShift.id || generateUUID(), synced: false, created_at: now, updated_at: now });
    }
    db.saveShifts(shifts);
  },

  importEntries: (newEntries: VehicleEntry[], origin: ImportOrigin): number => {
    const currentEntries = db.getEntries();
    const currentIds = new Set(currentEntries.map(e => e.id));
    const now = new Date().toISOString();
    const toAdd = newEntries.filter(e => !currentIds.has(e.id)).map(e => ({ ...e, id: e.id || generateUUID(), origin, synced: false, created_at: now, updated_at: now }));
    if (toAdd.length > 0) {
      db.saveEntries([...currentEntries, ...toAdd]);
    }
    return toAdd.length;
  },
  
  getSettings: (): AppSettings => {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const defaults: AppSettings = {
      sectorContacts: [{ id: '1', name: 'Logística', number: '5500000000000' }, { id: '2', name: 'Almoxarifado', number: '5500000000000' }],
      companyName: 'Portaria PX', deviceName: 'Estação Principal', theme: 'light', fontSize: 'medium', synced: true
    };
    return data ? JSON.parse(data) : defaults;
  },
  
  saveSettings: (settings: AppSettings) => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ ...settings, synced: false, updated_at: new Date().toISOString() }));
  },
  
  getDraft: () => {
    const data = localStorage.getItem(STORAGE_KEYS.DRAFT);
    return data ? JSON.parse(data) : null;
  },
  saveDraft: (formData: any, step: number) => {
    localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify({ formData, step }));
  },
  clearDraft: () => {
    localStorage.removeItem(STORAGE_KEYS.DRAFT);
  }
};
