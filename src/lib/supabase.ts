import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.error('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY eksik (.env)');
}

// Mobil uygulamayla AYNI Supabase projesi. Tüm admin işlemleri buradaki
// RPC/tablolar üzerinden yapılır — yetki sunucuda RLS + master rol ile korunur.
//
// lock: supabase-js varsayılan olarak tarayıcının Web Locks API'sini kullanır.
// Bu kilit bir token yenileme isteğinde takılırsa giriş sonrası TÜM auth/sorgu
// çağrıları sonsuza dek bekler ("Yükleniyor…" ekranında kalma sorunu). Tek
// sekmeli/tek kullanıcılı admin panelinde gerçek kilide ihtiyaç yok — kilidi
// işlemi doğrudan çalıştıran geçişli bir fonksiyonla değiştiriyoruz.
const passthroughLock = <R,>(_name: string, _timeout: number, fn: () => Promise<R>): Promise<R> => fn();

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    lock: passthroughLock,
  },
});
