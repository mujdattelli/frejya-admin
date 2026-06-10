import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.error('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY eksik (.env)');
}

const passthroughLock = <R,>(_name: string, _timeout: number, fn: () => Promise<R>): Promise<R> => fn();

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.sessionStorage,
    lock: passthroughLock,
  },
});
