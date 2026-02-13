
import React, { useState, useEffect } from 'react';
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

const App: React.FC = () => {
  const { session: supabaseSession, loading: authLoading, signOut } = useAuth();
  const { internalUser, isAuthenticated, loading: internalLoading, logoutInternal } = useInternalAuth();
  
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [entries, setEntries] = useState<VehicleEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());
  const [session, setSession] = useState<UserSession | null>(db.getSession());
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Estado de Sincronização
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  // --- SYNC AUTOMÁTICO (30 MIN) ---
  useEffect(() => {
    const runAutoSync = async () => {
      if (navigator.onLine && supabaseSession) {
        console.log("Iniciando sincronização automática...");
        await syncService.syncAllModules(setSyncStatus);
      }
    };

    if (supabaseSession) {
       runAutoSync();
    }

    const interval = setInterval(runAutoSync, 30 * 60 * 1000); // 30 minutos

    return () => clearInterval(interval);
  }, [supabaseSession]);

  // Sincroniza sessão do Login Interno com a sessão local do App (db)
  useEffect(() => {
    if (isAuthenticated && internalUser) {
      const userIdentifier = `${internalUser.username}@${supabaseSession?.user?.email}`;
      const localSession = db.getSession();
      
      if (!localSession || localSession.operatorName !== userIdentifier) {
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
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then(registration => {
            console.log('SW registrado com sucesso:', registration.scope);
          })
          .catch(err => {
            console.error('Falha ao registrar SW:', err);
          });
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

  const handleSwitchUser = async () => {
    if (confirm("Deseja trocar de usuário e voltar ao login operacional?")) {
      db.addLog('Sistema', 'Troca de Usuário', undefined, `Usuário ${internalUser?.username} saiu.`);
      logoutInternal();
      setCurrentView('DASHBOARD');
    }
  };

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  // 1. Loading Geral
  // O AuthContext agora tem timeout de 3s, então isso não deve ficar preso.
  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center gap-4 text-white">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs uppercase tracking-widest font-bold">Carregando Sistema...</p>
      </div>
    );
  }

  // 2. Login Principal (Supabase)
  if (!supabaseSession) return <Login />;

  // 3. Loading Interno (só deve aparecer se tiver sessão supabase)
  if (internalLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center gap-4 text-white">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs uppercase tracking-widest font-bold">Verificando Credenciais...</p>
      </div>
    );
  }

  // 4. Login Interno (Camada 2)
  if (!isAuthenticated) return <InternalLogin />;

  // 5. Troca de Senha
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
    if (!isAdmin) {
      if (currentView === 'MASTER_DATA' || currentView === 'SYSTEM_LOGS' || currentView === 'USER_MANAGEMENT') {
        return <Dashboard 
          onNewArrival={() => setCurrentView('NEW_ENTRY')} 
          activeCount={entries.filter(e => e.entryTime && !e.exitTime).length}
          onViewActive={() => setCurrentView('ACTIVE_LIST')}
          onViewShift={() => setCurrentView('SHIFT_MANAGER')}
          onViewMasterData={() => {}} 
          onViewContacts={() => setCurrentView('CONTACTS')}
          onViewBreakfast={() => setCurrentView('BREAKFAST')}
          onViewPackages={() => setCurrentView('PACKAGES')}
          onViewMeters={() => setCurrentView('METERS')}
          onViewLogs={() => {}} 
          onViewPatrols={() => setCurrentView('PATROLS')}
          userRole={internalUser?.role}
        />;
      }
    }

    switch (currentView) {
      case 'DASHBOARD':
        return <Dashboard 
          onNewArrival={() => setCurrentView('NEW_ENTRY')} 
          activeCount={entries.filter(e => e.entryTime && !e.exitTime).length}
          onViewActive={() => setCurrentView('ACTIVE_LIST')}
          onViewShift={() => setCurrentView('SHIFT_MANAGER')}
          onViewMasterData={() => setCurrentView('MASTER_DATA')}
          onViewContacts={() => setCurrentView('CONTACTS')}
          onViewBreakfast={() => setCurrentView('BREAKFAST')}
          onViewPackages={() => setCurrentView('PACKAGES')}
          onViewMeters={() => setCurrentView('METERS')}
          onViewLogs={() => setCurrentView('SYSTEM_LOGS')}
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
      case 'SYNC': return <Sync entries={entries} onUpdate={refreshEntries} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'SETTINGS': return <Settings settings={settings} onSave={handleSaveSettings} onBack={() => setCurrentView('DASHBOARD')} installPrompt={deferredPrompt} onInstall={handleInstallApp} onManageUsers={() => setCurrentView('USER_MANAGEMENT')} />;
      case 'USER_MANAGEMENT': return <UserManagement onBack={() => setCurrentView('DASHBOARD')} />;
      default: return <Dashboard onNewArrival={() => {}} activeCount={0} onViewActive={() => {}} onViewShift={() => {}} onViewMasterData={() => {}} onViewContacts={() => {}} onViewBreakfast={() => {}} onViewPackages={() => {}} onViewMeters={() => {}} onViewLogs={() => {}} onViewPatrols={() => {}} />;
    }
  };

  return (
    <div className={`flex flex-col h-full max-w-4xl mx-auto shadow-xl bg-white dark:bg-slate-900 dark:border-slate-800 border-x transition-all duration-200 ${fontSizeClass}`}>
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
             {internalUser?.role === 'admin' && (
                <button onClick={() => setCurrentView('USER_MANAGEMENT')} className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition-colors border border-blue-400/50 shadow-sm" title="Gerenciar Usuários">
                  <Icons.Shield />
                </button>
             )}
             <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase font-bold block leading-none mb-1">
                  {internalUser?.role === 'admin' ? '⭐ Administrador' : 'Porteiro'}
                </span>
                <span className="text-xs bg-slate-800 px-2 py-1 rounded border border-slate-700 font-bold block max-w-[120px] truncate">
                  {internalUser?.username}
                </span>
             </div>
             <button onClick={handleSwitchUser} className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white p-2 rounded-lg transition-colors border border-red-900/50" title="Trocar Usuário">
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
