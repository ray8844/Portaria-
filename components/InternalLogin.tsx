
import React, { useState } from 'react';
import { useInternalAuth } from '../context/InternalAuthContext';

const InternalLogin: React.FC = () => {
  const { loginInternal, loading, error, resetContext } = useInternalAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    
    setStatusMsg('Conectando ao banco...');
    const success = await loginInternal(username, password);
    if (!success) {
      setStatusMsg('');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-6 z-[100]">
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-2xl animate-in zoom-in duration-300">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
             🔐
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tighter">Login Operacional</h2>
          <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mt-1">Identifique-se para continuar</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-black rounded-xl text-center border border-red-200 dark:border-red-900/50 uppercase">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Usuário</label>
            <input
              type="text"
              required
              autoFocus
              disabled={loading}
              className="w-full p-4 bg-slate-100 dark:bg-slate-900 rounded-xl border-none focus:ring-2 focus:ring-blue-500 text-sm dark:text-white disabled:opacity-50"
              placeholder="Ex: adm"
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Senha</label>
            <input
              type="password"
              required
              disabled={loading}
              className="w-full p-4 bg-slate-100 dark:bg-slate-900 rounded-xl border-none focus:ring-2 focus:ring-blue-500 text-sm dark:text-white disabled:opacity-50"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full ${loading ? 'bg-slate-500 cursor-not-allowed' : 'bg-slate-900 dark:bg-slate-100'} text-white dark:text-slate-900 p-5 rounded-2xl font-black text-sm shadow-xl transition-all active:scale-95 flex flex-col justify-center items-center uppercase tracking-widest`}
            >
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-[9px] mt-1">{statusMsg || 'Aguarde...'}</span>
                </div>
              ) : 'Acessar Sistema'}
            </button>

            <button
              type="button"
              onClick={() => {
                resetContext();
                window.location.reload();
              }}
              className="w-full text-slate-400 dark:text-slate-600 text-[9px] font-bold uppercase hover:text-blue-500 transition-colors py-2"
            >
              Problemas no Login? Recarregar Sessão
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InternalLogin;
