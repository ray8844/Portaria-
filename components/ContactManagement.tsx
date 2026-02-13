
import React, { useState, useRef } from 'react';
import { AppSettings, SectorContact } from '../types';
import { Icons } from '../constants';
import { exportContactsToJSON } from '../services/utils';

interface ContactManagementProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onBack: () => void;
}

const ContactManagement: React.FC<ContactManagementProps> = ({ settings, onSave, onBack }) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [newContact, setNewContact] = useState({ name: '', number: '' });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleAddContact = () => {
    if (newContact.name && newContact.number) {
      const contact: SectorContact = {
        id: Math.random().toString(36).substr(2, 9),
        name: newContact.name,
        number: newContact.number.replace(/\D/g, '')
      };
      const updated = {
        ...formData,
        sectorContacts: [...formData.sectorContacts, contact]
      };
      setFormData(updated);
      setNewContact({ name: '', number: '' });
    }
  };

  const handleRemoveContact = (id: string) => {
    setFormData({
      ...formData,
      sectorContacts: formData.sectorContacts.filter(c => c.id !== id)
    });
  };

  const handleUpdateContact = (id: string, name: string, number: string) => {
    setFormData({
      ...formData,
      sectorContacts: formData.sectorContacts.map(c => 
        c.id === id ? { ...c, name, number: number.replace(/\D/g, '') } : c
      )
    });
  };

  const handleExportContacts = () => {
    exportContactsToJSON(formData.sectorContacts);
  };

  const handleImportContacts = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json.contacts)) {
          // Unir contatos sem duplicar números
          const currentNumbers = new Set(formData.sectorContacts.map(c => c.number));
          const toAdd = json.contacts.filter((c: SectorContact) => !currentNumbers.has(c.number));
          
          if (toAdd.length > 0) {
            setFormData({
              ...formData,
              sectorContacts: [...formData.sectorContacts, ...toAdd]
            });
            alert(`${toAdd.length} novos contatos adicionados! Clique em SALVAR para confirmar.`);
          } else {
            alert('Todos os contatos do arquivo já existem na sua lista.');
          }
        }
      } catch (err) {
        alert('Erro ao processar arquivo de contatos.');
      }
    };
    reader.readAsText(file);
  };

  const handleFinish = () => {
    onSave(formData);
  };

  return (
    <div className="p-6 space-y-6 animate-in slide-in-from-bottom duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors">
             ←
          </button>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tighter">Contatos Liberação</h2>
        </div>
        <div className="flex gap-2">
           <button 
             onClick={() => importFileRef.current?.click()}
             className="text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg"
           >
             IMPORTAR
           </button>
           <button 
             onClick={handleExportContacts}
             className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-2 rounded-lg"
           >
             EXPORTAR
           </button>
           <input type="file" ref={importFileRef} className="hidden" accept=".json" onChange={handleImportContacts} />
        </div>
      </div>

      <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800 text-xs text-green-700 dark:text-green-400">
        Cadastre os números de WhatsApp dos responsáveis pelos setores para envio rápido de solicitações de acesso.
      </div>

      <div className="bg-white dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Contatos Cadastrados</h3>
        
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {formData.sectorContacts.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-xs italic">Nenhum contato cadastrado.</p>
          ) : (
            formData.sectorContacts.map(contact => (
              <div key={contact.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-700 shadow-sm">
                {editingContactId === contact.id ? (
                  <div className="flex-1 grid grid-cols-1 gap-2 mr-2">
                    <input className="text-xs p-2 rounded bg-white dark:bg-slate-800 border" value={contact.name} onChange={e => handleUpdateContact(contact.id, e.target.value, contact.number)} placeholder="Nome do Setor" />
                    <input className="text-xs p-2 rounded bg-white dark:bg-slate-800 border font-mono" value={contact.number} onChange={e => handleUpdateContact(contact.id, contact.name, e.target.value)} placeholder="WhatsApp com DDD" />
                  </div>
                ) : (
                  <div className="flex-1">
                    <span className="font-bold text-sm dark:text-slate-200 block">{contact.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{contact.number}</span>
                  </div>
                )}
                <div className="flex gap-2">
                   <button onClick={() => setEditingContactId(editingContactId === contact.id ? null : contact.id)} className="text-blue-500 text-xs font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                     {editingContactId === contact.id ? 'SALVAR' : 'EDITAR'}
                   </button>
                   <button onClick={() => handleRemoveContact(contact.id)} className="text-red-500 p-1">🗑️</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-6 border-t dark:border-slate-700 space-y-3">
           <h4 className="text-[10px] font-black text-slate-500 uppercase">Adicionar Novo Responsável</h4>
           <div className="grid grid-cols-1 gap-2">
             <input
                className="w-full p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-sm border-none focus:ring-2 focus:ring-green-500 dark:text-white"
                placeholder="Nome do Setor / Pessoa"
                value={newContact.name}
                onChange={e => setNewContact({...newContact, name: e.target.value})}
             />
             <div className="flex gap-2">
               <input
                  className="flex-1 p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-sm border-none focus:ring-2 focus:ring-green-500 dark:text-white font-mono"
                  placeholder="55 + DDD + Número"
                  value={newContact.number}
                  onChange={e => setNewContact({...newContact, number: e.target.value})}
               />
               <button onClick={handleAddContact} className="bg-green-600 text-white px-6 rounded-xl font-bold text-xs shadow-lg shadow-green-200 dark:shadow-none uppercase">Adicionar</button>
             </div>
           </div>
        </div>
      </div>

      <button
        onClick={handleFinish}
        className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 p-6 rounded-2xl text-xl font-bold shadow-xl active:scale-95 transition-all"
      >
        SALVAR E VOLTAR
      </button>
    </div>
  );
};

export default ContactManagement;
