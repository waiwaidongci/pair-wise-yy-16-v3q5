import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Photo } from '../data/photos'

interface LightboxState {
  photos: Photo[]
  index: number
}

interface LightboxContextValue {
  state: LightboxState | null
  /** 打开灯箱。photos 必须是调用方当前可见的照片子集（如筛选结果），
   *  灯箱的上一张/下一张只在这个范围内循环。 */
  open: (photos: Photo[], index: number) => void
  close: () => void
  next: () => void
  prev: () => void
}

const LightboxContext = createContext<LightboxContextValue | null>(null)

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LightboxState | null>(null)

  const open = useCallback((photos: Photo[], index: number) => {
    if (photos.length === 0) return
    setState({ photos, index: Math.max(0, Math.min(index, photos.length - 1)) })
  }, [])

  const close = useCallback(() => setState(null), [])

  // 循环导航，严格限定在打开时传入的照片范围内
  const next = useCallback(() => {
    setState((s) => (s ? { ...s, index: (s.index + 1) % s.photos.length } : s))
  }, [])
  const prev = useCallback(() => {
    setState((s) => (s ? { ...s, index: (s.index - 1 + s.photos.length) % s.photos.length } : s))
  }, [])

  const value = useMemo(
    () => ({ state, open, close, next, prev }),
    [state, open, close, next, prev],
  )
  return <LightboxContext.Provider value={value}>{children}</LightboxContext.Provider>
}

export function useLightbox(): LightboxContextValue {
  const ctx = useContext(LightboxContext)
  if (!ctx) throw new Error('useLightbox 必须在 LightboxProvider 内使用')
  return ctx
}
