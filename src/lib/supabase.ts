import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.error('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY eksik (.env)');
}

// Mobil uygulamayla AYNI Supabase projesi. Tüm admin işlemleri buradaki
// RPC/tablolar üzerinden yapılır — yetki sunucuda RLS + master rol ile korunur.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
