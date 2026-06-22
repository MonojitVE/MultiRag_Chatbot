import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);
const STORAGE_KEY = 'rag_admin_key';

export function AuthProvider({ children }) {
  const [adminKey, setAdminKey] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) || ''
  );

  const login = useCallback((key) => {
    sessionStorage.setItem(STORAGE_KEY, key);
    setAdminKey(key);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAdminKey('');
  }, []);

  return (
    <AuthContext.Provider value={{ adminKey, isLoggedIn: !!adminKey, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
