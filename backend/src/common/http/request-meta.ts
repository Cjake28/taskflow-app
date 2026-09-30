import type { Request } from 'express';

export interface SessionMeta {
  userAgent: string | null;
  ip: string | null;
}

export function sessionMeta(req: Request): SessionMeta {
  return {
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
    ip: req.ip ?? null,
  };
}
