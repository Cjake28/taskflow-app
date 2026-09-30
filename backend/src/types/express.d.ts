export {};

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: { id: string; sessionId: string };
      /** Parsed output of the `validate` middleware. */
      valid: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}
