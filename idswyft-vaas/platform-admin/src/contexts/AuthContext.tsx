import React, { createContext, useContext, useEffect, useReducer, ReactNode } from 'react';
import { platformApi, type PlatformAdmin } from '../services/api';

// ── State shape ──────────────────────────────────────────────────────────────
interface AuthState {
  isAuthenticated: boolean;
  admin: PlatformAdmin | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

// ── Reducer ──────────────────────────────────────────────────────────────────
type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { admin: PlatformAdmin; token: string } }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'REFRESH_START' }
  | { type: 'REFRESH_SUCCESS'; payload: { admin: PlatformAdmin } }
  | { type: 'REFRESH_FAILURE' };

// If a token exists in localStorage, start in loading state so auth guards
// wait for the refresh to complete instead of immediately redirecting to login.
const hasExistingToken = platformApi.isAuthenticated();

const initialState: AuthState = {
  isAuthenticated: false,
  admin: null,
  token: null,
  loading: hasExistingToken,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
    case 'REFRESH_START':
      return { ...state, loading: true, error: null };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        admin: action.payload.admin,
        token: action.payload.token,
        loading: false,
        error: null,
      };

    case 'REFRESH_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        admin: action.payload.admin,
        loading: false,
        error: null,
      };

    case 'LOGIN_FAILURE':
      return {
        ...state,
        isAuthenticated: false,
        admin: null,
        token: null,
        loading: false,
        error: action.payload,
      };

    case 'REFRESH_FAILURE':
    case 'LOGOUT':
      return { ...initialState };

    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const login = async (email: string, password: string) => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const { admin, token } = await platformApi.login(email, password);

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { admin, token },
      });
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error?.message || error.message || 'Login failed';
      dispatch({ type: 'LOGIN_FAILURE', payload: errorMessage });
      throw error;
    }
  };

  const logout = async () => {
    try {
      await platformApi.logout();
    } catch (error) {
      console.warn('Logout API call failed:', error);
    }

    dispatch({ type: 'LOGOUT' });
  };

  const refreshAuth = async () => {
    if (!platformApi.isAuthenticated()) {
      dispatch({ type: 'REFRESH_FAILURE' });
      return;
    }

    dispatch({ type: 'REFRESH_START' });

    try {
      const { admin } = await platformApi.getMe();

      dispatch({
        type: 'REFRESH_SUCCESS',
        payload: { admin },
      });
    } catch (error) {
      console.error('Failed to refresh auth:', error);
      dispatch({ type: 'REFRESH_FAILURE' });
    }
  };

  // Check authentication on mount
  useEffect(() => {
    if (platformApi.isAuthenticated()) {
      refreshAuth();
    }
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
