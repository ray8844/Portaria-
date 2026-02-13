
import React, { useState, useEffect, useRef } from 'react';
import { ViewState, VehicleEntry, AppSettings, UserSession, SyncStatus } from './types';
import { db } from './services/db';
import { syncService } from './services/sync';
import { useAuth } from './context/AuthContext';
import { useInternalAuth } from './context/InternalAuthContext';
import { Icons } from './constants';
import Dashboard from './components/Dashboard';
import NewEntryFlow from './components/NewEntryFlow';
import ActiveVehicles from './components/ActiveVehicles';
import Reports from './components/Reports';
import Settings from './components/Settings';
import Sync from './components/Sync';
import Navbar from './components/Navbar';
import Login from './components/Login';
import InternalLogin from './components/InternalLogin';
import ChangePassword from './components/ChangePassword';
import UserManagement from './components/UserManagement';
import WorkShiftManager from './components/WorkShiftManager';
import DataManagement from './components/DataManagement';
import ContactManagement from './components/ContactManagement';
import BreakfastManager from './components/BreakfastManager';
import PackageManager from './components/PackageManager';
import MeterManager from './components/MeterManager';
import SystemLogs from './components/SystemLogs';
import PatrolManager from './components/PatrolManager';

// Componente Interno para Confirmação com Seguro (Hold)
const ConfirmHoldModal = ({ isOpen, onClose, onConfirm, title, description, color }: any) => {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);

  const startHold = () => {
    setProgress(0);
    const startTime = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / 2000) * 100, 100);
      setProgress(newProgress);
      if (newProgress >= 100) {
        if (timerRef.current) clearInterval(timerRef.current);
        onConfirm();
      }
    }, 50);
  };

  const stopHold = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 z-[200] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-[32px] p-8 shadow-2xl text-center space-y-6 animate-in zoom-in duration-300">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${color === 'red' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
           <span className="text-2xl">⚠️</span>
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{description}</p>
        </div>

        <div className="space-y-4 pt-4">
          <button
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            className={`relative w-full py-6 rounded-2xl font-black text-sm uppercase tracking-widest overflow-hidden select-none transition-transform active:scale-95 ${
              color === 'red' ? 'bg-red-600 text-white shadow-red-200' : 'bg-blue-600 text-white shadow-blue-200'
            }`}
          >
            <span className="relative z-10">Segure para Confirmar</span>
            <div 
              className="absolute inset-y-0 left-0 bg-black/20 transition-all duration-75" 
              style={{ width: `${progress}%` }}
            />
          </button>
          
          <button 
            onClick={onClose}
            className="w-full py-4 text-slate-400 dark:text-slate-500 font-bold text-xs uppercase hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Cancelar
          </button>
        </div>
        
        <p className="text-[10px] text-slate-400 dark:text-slate-600 font-bold uppercase">Mantenha pressionado por 2 segundos</p>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const { session: supabaseSession, loading: authLoading, signOut } = useAuth();
  const { internalUser, isAuthenticated, loading: internalLoading, logoutInternal } = useInternalAuth();
  
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [entries, setEntries] = useState<VehicleEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());
  const [session, setSession] = useState<UserSession | null>(db.getSession());
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  // Estado para os Modais de Confirmação
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    type: 'switch' | 'logout';
  }>({ show: false, type: 'switch' });

  useEffect(() => {
    const runAutoSync = async () => {
      if (navigator.onLine && supabaseSession) {
        await syncService.syncAllModules(setSyncStatus);
      }
    };
    if (supabaseSession) runAutoSync();
    const interval = setInterval(runAutoSync, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [supabaseSession]);

  useEffect(() => {
    if (isAuthenticated && internalUser) {
      const localSession = db.getSession();
      if (!localSession || localSession.operatorName !== internalUser.username) {
        const newSession = {
          operatorName: internalUser.username, 
          loginTime: new Date().toISOString()
        };
        db.saveSession(newSession);
        setSession(newSession);
        db.addLog('Sistema', 'Login Operacional', undefined, `Usuário ${internalUser.username} autenticado.`);
      }
    } else if (!isAuthenticated) {
      if (db.getSession()) {
        db.clearSession();
        setSession(null);
      }
    }
  }, [isAuthenticated, internalUser]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
      });
    }

    const handleOnline = () => {
      setIsOnline(true);
      if (supabaseSession) syncService.syncAllModules(setSyncStatus);
    };
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    setEntries(db.getEntries());
    
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [settings.theme]);

  const refreshEntries = () => {
    setEntries(db.getEntries());
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    db.saveSettings(newSettings);
    setSettings(newSettings);
    setCurrentView('DASHBOARD');
  };

  // Funções de Confirmação Final
  const executeSwitchUser = () => {
    db.addLog('Sistema', 'Troca de Usuário', undefined, `Usuário ${internalUser?.username} saiu.`);
    logoutInternal();
    setCurrentView('DASHBOARD');
    setConfirmModal({ ...confirmModal, show: false });
  };

  const executeLogoutAccount = async () => {
    db.addLog('Sistema', 'Logout Supabase', undefined, `Admin ${internalUser?.username} desconectou a conta.`);
    logoutInternal(); 
    await signOut();
    setConfirmModal({ ...confirmModal, show: false });
  };

  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center gap-4 text-white">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs uppercase tracking-widest font-bold">Carregando Sistema...</p>
      </div>
    );
  }

  if (!supabaseSession) return <Login />;

  if (internalLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center gap-4 text-white">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs uppercase tracking-widest font-bold">Verificando Credenciais...</p>
      </div>
    );
  }

  if (!isAuthenticated) return <InternalLogin />;

  if (internalUser?.must_change_password) return <ChangePassword />;

  const fontSizeClass = {
    small: 'text-[13px]',
    medium: 'text-[15px]',
    large: 'text-[18px]',
    xlarge: 'text-[21px]'
  }[settings.fontSize || 'medium'];

  const getSyncStatusIcon = () => {
    if (!isOnline) return <span className="text-slate-500">📵 Offline</span>;
    switch(syncStatus) {
      case 'syncing': return <span className="text-blue-400 animate-pulse">🔄 Sincronizando...</span>;
      case 'success': return <span className="text-green-400">☁️ Sincronizado</span>;
      case 'error': return <span className="text-red-400">⚠️ Erro Sync</span>;
      default: return <span className="text-slate-400">☁️ Conectado</span>;
    }
  };

  const renderView = () => {
    const isAdmin = internalUser?.role === 'admin';
    switch (currentView) {
      case 'DASHBOARD':
        return <Dashboard 
          onNewArrival={() => setCurrentView('NEW_ENTRY')} 
          activeCount={entries.filter(e => e.entryTime && !e.exitTime).length}
          onViewActive={() => setCurrentView('ACTIVE_LIST')}
          onViewShift={() => setCurrentView('SHIFT_MANAGER')}
          onViewMasterData={() => isAdmin ? setCurrentView('MASTER_DATA') : {}}
          onViewContacts={() => setCurrentView('CONTACTS')}
          onViewBreakfast={() => setCurrentView('BREAKFAST')}
          onViewPackages={() => setCurrentView('PACKAGES')}
          onViewMeters={() => setCurrentView('METERS')}
          onViewLogs={() => isAdmin ? setCurrentView('SYSTEM_LOGS') : {}}
          onViewPatrols={() => setCurrentView('PATROLS')}
          userRole={internalUser?.role}
        />;
      case 'PATROLS': return <PatrolManager onBack={() => setCurrentView('DASHBOARD')} operatorName={internalUser?.username || 'Porteiro'} />;
      case 'SYSTEM_LOGS': return <SystemLogs onBack={() => setCurrentView('DASHBOARD')} />;
      case 'METERS': return <MeterManager onBack={() => setCurrentView('DASHBOARD')} operatorName={internalUser?.username || 'Porteiro'} />;
      case 'PACKAGES': return <PackageManager onBack={() => setCurrentView('DASHBOARD')} operatorName={internalUser?.username || 'Porteiro'} />;
      case 'BREAKFAST': return <BreakfastManager onBack={() => setCurrentView('DASHBOARD')} operatorName={internalUser?.username || 'Porteiro'} />;
      case 'CONTACTS': return <ContactManagement settings={settings} onSave={handleSaveSettings} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'MASTER_DATA': return <DataManagement onBack={() => setCurrentView('DASHBOARD')} />;
      case 'SHIFT_MANAGER': return <WorkShiftManager onBack={() => setCurrentView('DASHBOARD')} operatorName={internalUser?.username || 'Porteiro'} />;
      case 'NEW_ENTRY': return <NewEntryFlow settings={settings} operatorName={internalUser?.username || 'Porteiro'} onComplete={() => { refreshEntries(); setCurrentView('DASHBOARD'); }} onCancel={() => setCurrentView('DASHBOARD')} />;
      case 'ACTIVE_LIST': return <ActiveVehicles entries={entries.filter(e => e.entryTime && !e.exitTime)} onUpdate={refreshEntries} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'REPORTS': return <Reports entries={entries} onBack={() => setCurrentView('DASHBOARD')} onUpdate={refreshEntries} />;
      case 'SETTINGS': return <Settings settings={settings} onSave={handleSaveSettings} onBack={() => setCurrentView('DASHBOARD')} installPrompt={deferredPrompt} onInstall={() => deferredPrompt.prompt()} onManageUsers={() => setCurrentView('USER_MANAGEMENT')} onSwitchUserRequest={() => setConfirmModal({ show: true, type: 'switch' })} onLogoutRequest={() => setConfirmModal({ show: true, type: 'logout' })} />;
      case 'USER_MANAGEMENT': return <UserManagement onBack={() => setCurrentView('DASHBOARD')} />;
      default: return <Dashboard onNewArrival={() => {}} activeCount={0} onViewActive={() => {}} onViewShift={() => {}} onViewMasterData={() => {}} onViewContacts={() => {}} onViewBreakfast={() => {}} onViewPackages={() => {}} onViewMeters={() => {}} onViewLogs={() => {}} onViewPatrols={() => {}} />;
    }
  };

  return (
    <div className={`flex flex-col h-full max-w-4xl mx-auto shadow-xl bg-white dark:bg-slate-900 dark:border-slate-800 border-x transition-all duration-200 ${fontSizeClass}`}>
      {confirmModal.show && (
        <ConfirmHoldModal 
          isOpen={confirmModal.show}
          onClose={() => setConfirmModal({ ...confirmModal, show: false })}
          onConfirm={confirmModal.type === 'switch' ? executeSwitchUser : executeLogoutAccount}
          title={confirmModal.type === 'switch' ? "Trocar Usuário" : "Sair da Conta"}
          description={confirmModal.type === 'switch' ? "Deseja voltar para a tela de login operacional?" : "A conta da empresa será desconectada deste dispositivo."}
          color={confirmModal.type === 'logout' ? 'red' : 'blue'}
        />
      )}

      {!isOnline && (
        <div className="bg-red-600 text-white text-[10px] font-black uppercase tracking-widest py-1.5 text-center z-[100] shadow-md">
          ⚠️ MODO OFFLINE ATIVO • DADOS SEGUROS NO DISPOSITIVO
        </div>
      )}
      
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-30 shadow-md">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Portaria Express</h1>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
               <span className="text-slate-400">{settings.companyName}</span>
               <span className="text-slate-600">•</span>
               {getSyncStatusIcon()}
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase font-bold block leading-none mb-1">
                  {internalUser?.role === 'admin' ? '⭐ Administrador' : 'Porteiro'}
                </span>
                <span className="text-xs bg-slate-800 px-2 py-1 rounded border border-slate-700 font-bold block max-w-[120px] truncate">
                  {internalUser?.username}
                </span>
             </div>
             <button onClick={() => setConfirmModal({ show: true, type: 'switch' })} className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white p-2 rounded-lg transition-colors border border-red-900/50" title="Trocar Usuário">
               <Icons.Logout />
             </button>
          </div>
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto pb-24">
        {renderView()}
      </main>

      <Navbar currentView={currentView} setView={setCurrentView} />
    </div>
  );
};

export default App;
