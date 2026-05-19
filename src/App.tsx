import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Login } from './components/Login';
import { MfaGate } from './components/MfaGate';
import { Dashboard } from './components/Dashboard';

// Ağ takılırsa sonsuza dek "Yükleniyor…" ekranında kalmamak için her
// Supabase çağrısını bir zaman aşımıyla sarmalar.
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [mfaOk, setMfaOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setRole(null);
        setMfaOk(false);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Oturum açıldığında: 2FA durumu (AAL) + master rolü doğrulanır.
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setAuthError(null);
    (async () => {
      try {
        const { data: aal } = await withTimeout(
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          15000,
        );
        setMfaOk(aal?.currentLevel === 'aal2');
        const { data: prof, error } = await withTimeout(
          supabase.from('private_users').select('role').eq('id', session.user.id).single(),
          15000,
        );
        // PGRST116 = satır yok → kullanıcı private_users'ta değil (yetkisiz),
        // hata değil; rol null kalır ve "yetkin yok" ekranı gösterilir.
        if (error && error.code !== 'PGRST116') throw error;
        setRole((prof as { role?: string } | null)?.role ?? null);
      } catch (e) {
        setAuthError('Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.');
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  // MFA doğrulaması (kayıt ya da kod) tamamlanınca oturum AAL2 olur.
  const handleMfaVerified = async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setMfaOk(aal?.currentLevel === 'aal2');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-white/40">Yükleniyor…</div>;
  }
  if (authError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-red-400">{authError}</p>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="border border-white/20 rounded-lg px-5 py-2 text-sm text-white/70 hover:bg-white/5"
          >
            Tekrar dene
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="border border-white/20 rounded-lg px-5 py-2 text-sm text-white/70 hover:bg-white/5"
          >
            Çıkış Yap
          </button>
        </div>
      </div>
    );
  }
  if (!session) return <Login />;
  if (!mfaOk) return <MfaGate onVerified={handleMfaVerified} />;
  if (role !== 'master') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-red-400">Bu hesabın yönetim paneline erişim yetkisi yok.</p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="border border-white/20 rounded-lg px-5 py-2 text-sm text-white/70 hover:bg-white/5"
        >
          Çıkış Yap
        </button>
      </div>
    );
  }
  return <Dashboard email={session.user.email ?? ''} />;
}
