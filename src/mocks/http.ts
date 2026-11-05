export class HttpError extends Error {
  status: number
  fields?: Record<string, string>
  extra?: Record<string, unknown>
  constructor(status: number, message: string, fields?: Record<string, string>, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.fields = fields
    this.extra = extra
  }
}

export interface Req {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
  headers: Headers
}

export type Result = { status?: number; json?: unknown; text?: string; contentType?: string }
