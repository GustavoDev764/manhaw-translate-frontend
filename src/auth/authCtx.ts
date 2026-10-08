import { createContext, useContext } from 'react'
import type { FeatureKey, Me } from '../adminApi'

export interface AuthState {
  me: Me | null
  loading: boolean
  offline: string | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
  can: (key: FeatureKey) => boolean
}

export const AuthCtx = createContext<AuthState>({
  me: null,
  loading: true,
  offline: null,
  refresh: async () => {},
  logout: async () => {},
  can: () => false,
})

export const useAuth = () => useContext(AuthCtx)

export const DISABLED_REASON = 'Desativado pelo administrador para o seu usuário'
