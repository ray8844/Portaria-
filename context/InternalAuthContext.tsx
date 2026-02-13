
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { InternalUser } from '../types';
import bcrypt from 'bcryptjs';

interface InternalAuthContextType {
  internalUser: InternalUser | null;
  isAuthenticated: boolean;
  loginInternal: (username: string, password: string) => Promise<boolean>;
  logoutInternal: () => void;
  changePassword: (newPassword: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
  resetContext: () => void;
}

const STORAGE_KEY = 'portaria_express_internal_user_v2';

const InternalAuthContext = createContext<InternalAuthContextType | undefined>(undefined);

export const InternalAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading: authLoading } = useAuth();
  
  const [internalUser, setInternalUser] = useState<InternalUser | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem(STORAGE_KEY);
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetContext = () => {
    localStorage.removeItem(STORAGE_KEY);
    setInternalUser(null);
    setIsAuthenticated(false);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      resetContext();
      return;
    }

    const verifyUserInBackground = async () => {
      try {
        // Se não houver internet, não fazemos nada para não deslogar por erro de rede
        if (!navigator.onLine) return;

        const { data: users, error: fetchError } = await supabase
          .from('internal_users')
          .select('id, username, role, must_change_password, supabase_user_id')
          .eq('supabase_user_id', session.user.id);

        if (fetchError) {
          console.warn("InternalAuth: Falha na verificação de rede. Mantendo sessão local.");
          return; 
        }

        if (!users || users.length === 0) {
          console.log("InternalAuth: Criando usuário ADM inicial...");
          const salt = await bcrypt.genSalt(6);
          const hash = await bcrypt.hash('123', salt);
          await supabase.from('internal_users').insert({
            supabase_user_id: session.user.id,
            username: 'adm',
            password_hash: hash,
            role: 'admin',
            must_change_password: true
          });
          return;
        } 
        
        if (isAuthenticated && internalUser) {
           const stillExists = users.some(u => u.username === internalUser.username);
           if (!stillExists) {
             console.error("InternalAuth: Usuário não existe mais no banco. Deslogando.");
             resetContext();
           }
        }
      } catch (err) {
        // Silencioso: não atrapalha a experiência se falhar por rede
        console.debug("InternalAuth background check failed (ignored):", err);
      }
    };

    verifyUserInBackground();
  }, [session, authLoading]);

  const loginInternal = async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setError("O dispositivo está processando lentamente. Tente novamente.");
    }, 45000);

    try {
      if (!session) throw new Error("Sessão principal expirada.");

      const { data: user, error: userError } = await supabase
        .from('internal_users')
        .select('*')
        .eq('supabase_user_id', session.user.id)
        .eq('username', username.toLowerCase().trim())
        .maybeSingle();

      if (userError) throw userError;
      if (!user) {
        setError("Usuário não cadastrado.");
        return false;
      }

      await new Promise(r => setTimeout(r, 200));
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (isValid) {
        setInternalUser(user);
        setIsAuthenticated(true);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        return true;
      } else {
        setError("Senha operacional incorreta.");
        return false;
      }
    } catch (err: any) {
      setError(err.message || "Erro de conexão.");
      return false;
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const logoutInternal = () => {
    resetContext();
  };

  const changePassword = async (newPassword: string): Promise<boolean> => {
    if (!internalUser) return false;
    setLoading(true);
    try {
      const salt = await bcrypt.genSalt(8);
      const hash = await bcrypt.hash(newPassword, salt);
      const { error: updateError } = await supabase
        .from('internal_users')
        .update({ password_hash: hash, must_change_password: false })
        .eq('id', internalUser.id);
      
      if (updateError) throw updateError;
      
      const updatedUser = { ...internalUser, password_hash: hash, must_change_password: false };
      setInternalUser(updatedUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <InternalAuthContext.Provider value={{
      internalUser,
      isAuthenticated,
      loginInternal,
      logoutInternal,
      changePassword,
      loading,
      error,
      resetContext
    }}>
      {children}
    </InternalAuthContext.Provider>
  );
};

export const useInternalAuth = () => {
  const context = useContext(InternalAuthContext);
  if (context === undefined) {
    throw new Error('useInternalAuth must be used within an InternalAuthProvider');
  }
  return context;
};
