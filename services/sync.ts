
import { supabase } from '../lib/supabaseClient';
import { db } from './db';
import { STORAGE_KEYS } from '../constants';
import { AppSettings, SyncStatus } from '../types';

/**
 * SERVIÇO DE SINCRONIZAÇÃO
 * Responsável por enviar dados locais para o Supabase (Push)
 * e garantir integridade entre LocalStorage e Nuvem.
 */

// Mapeamento de Tabela Local -> Tabela Supabase
// Obs: As chaves do objeto local serão convertidas para snake_case se necessário
// ou mantidas se o Supabase aceitar JSONB ou colunas compatíveis.
// Para robustez, faremos um mapeamento manual dos campos críticos.

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

      // 1. Processar Fila de Exclusão (Deletions)
      await this.processDeletionQueue();

      // 2. Sincronizar Módulos (Upserts)
      await this.syncEntries(userId);
      await this.syncBreakfast(userId);
      await this.syncPackages(userId);
      await this.syncMeters(userId);
      await this.syncMeterReadings(userId);
      await this.syncPatrols(userId);
      await this.syncLogs(userId);
      await this.syncSettings(userId);

      if (onStatusChange) onStatusChange('success');
      return { success: true, message: 'Sincronização concluída com sucesso.' };

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

    // Agrupar por tabela
    const byTable: Record<string, string[]> = {};
    queue.forEach(item => {
      if (!byTable[item.table]) byTable[item.table] = [];
      byTable[item.table].push(item.id);
    });

    for (const table of Object.keys(byTable)) {
      const ids = byTable[table];
      const { error } = await supabase.from(table).delete().in('id', ids);
      
      if (!error) {
        processedIds.push(...ids);
      } else {
        console.error(`Erro ao deletar de ${table}:`, error);
      }
    }

    db.clearDeletedQueue(processedIds);
  },

  // --- SINCRONIZADORES ESPECÍFICOS ---

  async syncEntries(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.ENTRIES);
    if (records.length === 0) return;

    const payload = records.map(r => ({
      id: r.id,
      user_id: userId,
      access_type: r.accessType,
      driver_name: r.driverName,
      company: r.company,
      supplier: r.supplier,
      operation_type: r.operationType,
      order_number: r.orderNumber,
      vehicle_plate: r.vehiclePlate,
      trailer_plate: r.trailerPlate,
      is_truck: r.isTruck,
      document_number: r.documentNumber,
      visit_reason: r.visitReason,
      visited_person: r.visitedPerson,
      status: r.status,
      rejection_reason: r.rejectionReason,
      entry_time: r.entryTime,
      exit_time: r.exitTime,
      volumes: r.volumes,
      sector: r.sector,
      observations: r.observations,
      exit_observations: r.exitObservations,
      created_at: r.created_at || r.createdAt, // Fallback para createdAt antigo
      updated_at: r.updated_at,
      operator_name: r.operatorName,
      device_name: r.deviceName,
      authorized_by: r.authorizedBy,
      origin: r.origin
    }));

    const { error } = await supabase.from('vehicle_entries').upsert(payload);
    if (!error) {
      db.markAsSynced(STORAGE_KEYS.ENTRIES, records.map(r => r.id));
    } else {
        throw error;
    }
  },

  async syncBreakfast(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.BREAKFAST);
    if (records.length === 0) return;

    const payload = records.map(r => ({
      id: r.id,
      user_id: userId,
      person_name: r.personName,
      breakfast_type: r.breakfastType,
      status: r.status,
      delivered_at: r.deliveredAt,
      operator_name: r.operatorName,
      date: r.date,
      observations: r.observations,
      origin: r.origin,
      created_at: r.created_at,
      updated_at: r.updated_at
    }));

    const { error } = await supabase.from('breakfast_list').upsert(payload);
    if (!error) {
      db.markAsSynced(STORAGE_KEYS.BREAKFAST, records.map(r => r.id));
    }
  },

  async syncPackages(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.PACKAGES);
    if (records.length === 0) return;

    const payload = records.map(r => ({
      id: r.id,
      user_id: userId,
      delivery_company: r.deliveryCompany,
      recipient_name: r.recipientName,
      description: r.description,
      operator_name: r.operatorName,
      received_at: r.receivedAt,
      status: r.status,
      delivered_at: r.deliveredAt,
      delivered_to: r.deliveredTo,
      pickup_type: r.pickupType,
      created_at: r.created_at,
      updated_at: r.updated_at
      // foto não enviada por ser base64 pesado, ou implementaria storage aqui
    }));

    const { error } = await supabase.from('packages').upsert(payload);
    if (!error) {
      db.markAsSynced(STORAGE_KEYS.PACKAGES, records.map(r => r.id));
    }
  },

  async syncMeters(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.METERS);
    if (records.length === 0) return;

    const payload = records.map(r => ({
      id: r.id,
      user_id: userId,
      name: r.name,
      type: r.type,
      unit: r.unit,
      custom_unit: r.customUnit,
      active: r.active,
      created_at: r.created_at || r.createdAt,
      updated_at: r.updated_at
    }));

    const { error } = await supabase.from('meters').upsert(payload);
    if (!error) {
      db.markAsSynced(STORAGE_KEYS.METERS, records.map(r => r.id));
    }
  },

  async syncMeterReadings(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.METER_READINGS);
    if (records.length === 0) return;

    const payload = records.map(r => ({
      id: r.id,
      user_id: userId,
      meter_id: r.meterId,
      value: r.value,
      consumption: r.consumption,
      observation: r.observation,
      operator: r.operator,
      timestamp: r.timestamp,
      created_at: r.created_at,
      updated_at: r.updated_at
      // photo omitida para economizar banda/storage neste modelo simples
    }));

    const { error } = await supabase.from('meter_readings').upsert(payload);
    if (!error) {
      db.markAsSynced(STORAGE_KEYS.METER_READINGS, records.map(r => r.id));
    }
  },

  async syncPatrols(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.PATROLS);
    if (records.length === 0) return;

    const payload = records.map(r => ({
      id: r.id,
      user_id: userId,
      data: r.data,
      hora_inicio: r.horaInicio,
      hora_fim: r.horaFim,
      duracao_minutos: r.duracaoMinutos,
      porteiro: r.porteiro,
      status: r.status,
      observacoes: r.observacoes,
      criado_em: r.criadoEm || r.created_at,
      created_at: r.created_at,
      updated_at: r.updated_at
      // fotos omitidas (base64)
    }));

    const { error } = await supabase.from('patrols').upsert(payload);
    if (!error) {
      db.markAsSynced(STORAGE_KEYS.PATROLS, records.map(r => r.id));
    }
  },

  async syncLogs(userId: string) {
    const records = db.getUnsyncedItems<any>(STORAGE_KEYS.LOGS);
    if (records.length === 0) return;

    const payload = records.map(r => ({
      id: r.id,
      user_id: userId,
      timestamp: r.timestamp,
      user_name: r.user,
      module: r.module,
      action: r.action,
      reference_id: r.referenceId,
      details: r.details,
      created_at: r.created_at
    }));

    const { error } = await supabase.from('app_logs').upsert(payload);
    if (!error) {
      db.markAsSynced(STORAGE_KEYS.LOGS, records.map(r => r.id));
    }
  },

  async syncSettings(userId: string) {
    const settings = db.getSettings();
    if (settings.synced) return; // Se já está sincronizado, ignora

    // Mapeamento de contatos para JSONB ou tabela relacional
    // Vamos assumir uma tabela 'app_settings' com uma coluna JSONB 'contacts'
    // E colunas company_name, etc.
    // Como settings é global por tenant (userId), usamos upsert com userId se for PK ou um ID fixo de tenant.
    // Para simplificar, assumimos que 'app_settings' tem user_id como UNIQUE/PK.
    
    const payload = {
      user_id: userId,
      company_name: settings.companyName,
      device_name: settings.deviceName,
      theme: settings.theme,
      font_size: settings.fontSize,
      sector_contacts: settings.sectorContacts, // Supabase vai tratar como JSONB
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('app_settings').upsert(payload, { onConflict: 'user_id' });
    
    if (!error) {
      // Atualiza localmente para synced
      const newSettings: AppSettings = { ...settings, synced: true };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));
    }
  }
};
