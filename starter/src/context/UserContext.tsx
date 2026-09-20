import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { getUserId, setUserId } from '../api/client'

export interface UserOption {
  id: string
  name: string
  role: string
}

export const USERS: UserOption[] = [
  { id: 'curator-1', name: '林澜', role: '策展人' },
  { id: 'editor-1', name: '周野', role: '图片编辑' },
  { id: 'reviewer-1', name: '沈一', role: '复核' },
  { id: 'reviewer-2', name: '顾诚', role: '复核' },
]

interface UserContextValue {
  userId: string
  user: UserOption
  switchUser: (id: string) => void
}

const UserContext = createContext<UserContextValue | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState(getUserId())

  const switchUser = useCallback((id: string) => {
    setUserId(id)
    setUserIdState(id)
  }, [])

  const value = useMemo<UserContextValue>(() => {
    const user = USERS.find((u) => u.id === userId) ?? USERS[0]
    return { userId, user, switchUser }
  }, [userId, switchUser])

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser 必须在 UserProvider 内使用')
  return ctx
}
