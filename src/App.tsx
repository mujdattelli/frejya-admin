import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Login } from './components/Login';
import { MfaGate } from './components/MfaGate';
import { Dashboard } from './components/Dashboard';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [mfaOk, setMfaOk] = useState(false);
  const [loading, setLoading] = useState(true);

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
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setMfaOk(aal?.currentLevel === 'aal2');
      const { data: prof } = await supabase
        .from('private_users')
        .select('role')
        .eq('id', session.user.id)
        .single();
      setRole((prof as { role?: string } | null)?.role ?? null);
      setLoading(false);
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
