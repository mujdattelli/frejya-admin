export const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
