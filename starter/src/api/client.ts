// API 客户端：统一携带用户身份头，规范化错误结构。
const USER_KEY = 'curation.userId'

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
}

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.status = status
    this.code = body.code
    this.details = body.details
  }
}

export function getUserId(): string {
  return localStorage.getItem(USER_KEY) || 'curator-1'
}

export function setUserId(id: string) {
  localStorage.setItem(USER_KEY, id)
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': getUserId(),
      ...(options.headers ?? {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const err = (json as { error?: ApiErrorBody }).error
    throw new ApiError(res.status, err ?? { code: 'UNKNOWN', message: `请求失败（${res.status}）` })
  }
  return json as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body, headers }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
