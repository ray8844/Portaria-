
import { supabase } from '../lib/supabaseClient';
import { db } from './db';
import { STORAGE_KEYS } from '../constants';
import { AppSettings, SyncStatus } from '../types';

/**
 * SERVIÇO DE SINCRONIZAÇÃO BIDIRECIONAL
 * Push: Envia mudanças locais não sincronizadas para o Supabase.
 * Pull: Baixa mudanças remotas feitas por outros dispositivos.
 */

export const syncService = {
  
  async checkConnection(): Promise<boolean> {
    try {
      const { error } = await supabase.from('app_logs').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  },

  async syncAllModules(onStatusChange?: (status: SyncStatus) => void): Promise<{ success: boolean; message: string }> {
    if (!navigator.onLine) {
      return { success: false, message: 'Sem conexão com a internet.' };
    }

    if (onStatusChange) onStatusChange('syncing');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão inválida para sincronização.");
      const userId = session.user.id;

      // 1. PROCESSAR FILA DE EXCLUSÃO (PUSH DELETE)
      await this.processDeletionQueue();

      // 2. ENVIAR DADOS LOCAIS (PUSH UPSERT)
      await this.pushAllModules(userId);

      // 3. BAIXAR DADOS REMOTOS (PULL)
      const pullResults = await this.pullAllModules(userId);

      if (onStatusChange) onStatusChange('success');
      
      let message = 'Sincronização concluída.';
      if (pullResults.totalAdded > 0) {
        message += ` ${pullResults.totalAdded} novos registros recebidos da nuvem!`;
      }

      return { success: true, message };

    } catch (err: any) {
      console.error("Erro na sincronização:", err);
      if (onStatusChange) onStatusChange('error');
      return { success: false, message: `Erro ao sincronizar: ${err.message}` };
    }
  },

  async processDeletionQueue() {
    const queue = db.getDeletedQueue();
    if (queue.length === 0) return;
    const processedIds: string[] = [];
    const byTable: Record<string, string[]> = {};
    queue.forEach(item => {
      if (!byTable[item.table]) byTable[item.table] = [];
      byTable[item.table].push(item.id);
    });
    for (const table of Object.keys(byTable)) {
      const ids = byTable[table];
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (!error) processedIds.push(...ids);
    }
    db.clearDeletedQueue(processedIds);
  },

  // --- PUSH: ENVIAR PARA NUVEM ---

  async pushAllModules(userId: string) {
    await this.pushEntries(userId);
    await this.pushBreakfast(userId);
    await this.pushPackages(userId);
    await this.pushMeters(userId);
    await this.pushMeterReadings(userId);
    await this.pushPatrols(userId);
    await this.pushLogs(userId);
    await this.pushSettings(userId);
  },

  async pushEntries(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.ENTRIES);
    if (records.length === 0) return;
    const payload = records.map(r => ({
      id: r.id, user_id: userId, access_type: r.accessType, driver_name: r.driverName,
      company: r.company, supplier: r.supplier, operation_type: r.operationType,
      order_number: r.orderNumber, vehicle_plate: r.vehiclePlate, trailer_plate: r.trailerPlate,
      is_truck: r.isTruck, document_number: r.documentNumber, visit_reason: r.visitReason,
      visited_person: r.visitedPerson, status: r.status, rejection_reason: r.rejectionReason,
      entry_time: r.entryTime, exit_time: r.exitTime, volumes: r.volumes, sector: r.sector,
      observations: r.observations, exit_observations: r.exitObservations,
      created_at: r.created_at || r.createdAt, updated_at: r.updated_at,
      operator_name: r.operatorName, device_name: r.deviceName, authorized_by: r.authorizedBy, origin: r.origin
    }));
    const { error } = await supabase.from('vehicle_entries').upsert(payload);
    if (!error) db.markAsSynced(STORAGE_KEYS.ENTRIES, records.map(r => r.id));
  },

  async pushBreakfast(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.BREAKFAST);
    if (records.length === 0) return;
    const payload = records.map(r => ({
      id: r.id, user_id: userId, person_name: r.personName, breakfast_type: r.breakfastType,
      status: r.status, delivered_at: r.deliveredAt, operator_name: r.operatorName,
      date: r.date, observations: r.observations, origin: r.origin, created_at: r.created_at, updated_at: r.updated_at
    }));
    const { error } = await supabase.from('breakfast_list').upsert(payload);
    if (!error) db.markAsSynced(STORAGE_KEYS.BREAKFAST, records.map(r => r.id));
  },

  async pushPackages(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.PACKAGES);
    if (records.length === 0) return;
    const payload = records.map(r => ({
      id: r.id, user_id: userId, delivery_company: r.deliveryCompany, recipient_name: r.recipientName,
      description: r.description, operator_name: r.operatorName, received_at: r.receivedAt,
      status: r.status, delivered_at: r.deliveredAt, delivered_to: r.deliveredTo, pickup_type: r.pickupType,
      created_at: r.created_at, updated_at: r.updated_at
    }));
    const { error } = await supabase.from('packages').upsert(payload);
    if (!error) db.markAsSynced(STORAGE_KEYS.PACKAGES, records.map(r => r.id));
  },

  async pushMeters(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.METERS);
    if (records.length === 0) return;
    const payload = records.map(r => ({
      id: r.id, user_id: userId, name: r.name, type: r.type, unit: r.unit, custom_unit: r.customUnit,
      active: r.active, created_at: r.created_at || r.createdAt, updated_at: r.updated_at
    }));
    const { error } = await supabase.from('meters').upsert(payload);
    if (!error) db.markAsSynced(STORAGE_KEYS.METERS, records.map(r => r.id));
  },

  async pushMeterReadings(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.METER_READINGS);
    if (records.length === 0) return;
    const payload = records.map(r => ({
      id: r.id, user_id: userId, meter_id: r.meterId, value: r.value, consumption: r.consumption,
      observation: r.observation, operator: r.operator, timestamp: r.timestamp, created_at: r.created_at, updated_at: r.updated_at
    }));
    const { error } = await supabase.from('meter_readings').upsert(payload);
    if (!error) db.markAsSynced(STORAGE_KEYS.METER_READINGS, records.map(r => r.id));
  },

  async pushPatrols(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.PATROLS);
    if (records.length === 0) return;
    const payload = records.map(r => ({
      id: r.id, user_id: userId, data: r.data, hora_inicio: r.horaInicio, hora_fim: r.horaFim,
      duracao_minutos: r.duracaoMinutos, porteiro: r.porteiro, status: r.status, observacoes: r.observacoes,
      criado_em: r.criadoEm || r.created_at, created_at: r.created_at, updated_at: r.updated_at
    }));
    const { error } = await supabase.from('patrols').upsert(payload);
    if (!error) db.markAsSynced(STORAGE_KEYS.PATROLS, records.map(r => r.id));
  },

  async pushLogs(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.LOGS);
    if (records.length === 0) return;
    const payload = records.map(r => ({
      id: r.id, user_id: userId, timestamp: r.timestamp, user_name: r.user, module: r.module,
      action: r.action, reference_id: r.referenceId, details: r.details, created_at: r.created_at
    }));
    const { error } = await supabase.from('app_logs').upsert(payload);
    if (!error) db.markAsSynced(STORAGE_KEYS.LOGS, records.map(r => r.id));
  },

  async pushSettings(userId: string) {
    const settings = db.getSettings();
    if (settings.synced) return;
    const payload = {
      user_id: userId, company_name: settings.companyName, device_name: settings.deviceName,
      theme: settings.theme, font_size: settings.fontSize, sector_contacts: settings.sectorContacts,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('app_settings').upsert(payload, { onConflict: 'user_id' });
    if (!error) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ ...settings, synced: true }));
    }
  },

  // --- PULL: BAIXAR DA NUVEM ---

  async pullAllModules(userId: string) {
    const results = { totalAdded: 0, totalUpdated: 0 };

    // Buscamos apenas os dados mais recentes (ex: últimos 7 dias) para economia de banda
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const dateLimit = lastWeek.toISOString();

    const modules = [
      { table: 'vehicle_entries', key: STORAGE_KEYS.ENTRIES },
      { table: 'breakfast_list', key: STORAGE_KEYS.BREAKFAST },
      { table: 'packages', key: STORAGE_KEYS.PACKAGES },
      { table: 'meters', key: STORAGE_KEYS.METERS },
      { table: 'meter_readings', key: STORAGE_KEYS.METER_READINGS },
      { table: 'patrols', key: STORAGE_KEYS.PATROLS },
      { table: 'app_settings', key: STORAGE_KEYS.SETTINGS }
    ];

    for (const mod of modules) {
      const { data, error } = await supabase
        .from(mod.table)
        .select('*')
        .eq('user_id', userId)
        .gt('updated_at', dateLimit);

      if (!error && data) {
        // Mapeamos de volta para o formato local CamelCase se necessário
        const mappedData = this.mapToLocal(mod.table, data);
        
        if (mod.table === 'app_settings' && data.length > 0) {
           // Settings é um caso especial (Single record)
           const cloudSettings = mappedData[0] as AppSettings;
           const local = db.getSettings();
           if (local.updated_at! < cloudSettings.updated_at!) {
              localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ ...cloudSettings, synced: true }));
           }
        } else {
          const res = db.upsertFromCloud(mod.key, mappedData);
          results.totalAdded += res.added;
          results.totalUpdated += res.updated;
        }
      }
    }

    return results;
  },

  // Converte Snake Case (Supabase) -> Camel Case (App Local)
  mapToLocal(table: string, data: any[]): any[] {
    return data.map(r => {
      switch (table) {
        case 'vehicle_entries': return {
          id: r.id, accessType: r.access_type, driverName: r.driver_name, company: r.company,
          supplier: r.supplier, operationType: r.operation_type, orderNumber: r.order_number,
          vehiclePlate: r.vehicle_plate, trailerPlate: r.trailer_plate, isTruck: r.is_truck,
          documentNumber: r.document_number, visitReason: r.visit_reason, visitedPerson: r.visited_person,
          status: r.status, rejectionReason: r.rejection_reason, entryTime: r.entry_time, exitTime: r.exit_time,
          volumes: r.volumes, sector: r.sector, observations: r.observations, exitObservations: r.exit_observations,
          created_at: r.created_at, updated_at: r.updated_at, operatorName: r.operator_name,
          deviceName: r.device_name, authorizedBy: r.authorized_by, origin: r.origin
        };
        case 'breakfast_list': return {
          id: r.id, personName: r.person_name, breakfastType: r.breakfast_type, status: r.status,
          deliveredAt: r.delivered_at, operatorName: r.operator_name, date: r.date,
          observations: r.observations, origin: r.origin, created_at: r.created_at, updated_at: r.updated_at
        };
        case 'packages': return {
          id: r.id, deliveryCompany: r.delivery_company, recipientName: r.recipient_name,
          description: r.description, operatorName: r.operator_name, receivedAt: r.received_at,
          status: r.status, deliveredAt: r.delivered_at, deliveredTo: r.delivered_to,
          pickupType: r.pickup_type, created_at: r.created_at, updated_at: r.updated_at
        };
        case 'meters': return {
          id: r.id, name: r.name, type: r.type, unit: r.unit, customUnit: r.custom_unit,
          active: r.active, created_at: r.created_at, updated_at: r.updated_at
        };
        case 'meter_readings': return {
          id: r.id, meterId: r.meter_id, value: r.value, consumption: r.consumption,
          observation: r.observation, operator: r.operator, timestamp: r.timestamp,
          created_at: r.created_at, updated_at: r.updated_at
        };
        case 'patrols': return {
          id: r.id, data: r.data, horaInicio: r.hora_inicio, horaFim: r.hora_fim,
          duracaoMinutos: r.duracao_minutos, porteiro: r.porteiro, status: r.status,
          observacoes: r.observacoes, created_at: r.created_at, updated_at: r.updated_at
        };
        case 'app_settings': return {
          companyName: r.company_name, deviceName: r.device_name, theme: r.theme,
          fontSize: r.font_size, sectorContacts: r.sector_contacts, updated_at: r.updated_at
        };
        default: return r;
      }
    });
  }
};
