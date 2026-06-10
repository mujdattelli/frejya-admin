import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { AdminMfa } from './components/AdminMfa';

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
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mfaOk, setMfaOk] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setRole(null);
        setMfaOk(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setAuthError(null);
    (async () => {
      try {
        const { data: prof, error } = await withTimeout(
          supabase.from('private_users').select('role').eq('id', session.user.id).single(),
          15000,
        );
        if (error && error.code !== 'PGRST116') throw error;
        const r = (prof as { role?: string } | null)?.role ?? null;
        setRole(r);
        if (r === 'master' || r === 'moderator') {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          setMfaOk(aal?.currentLevel === 'aal2');
        }
      } catch (e) {
        setAuthError('Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.');
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

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
  if (role !== 'master' && role !== 'moderator') {
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
  if (mfaOk === false) {
    return <AdminMfa onDone={() => setMfaOk(true)} />;
  }
  return <Dashboard email={session.user.email ?? ''} role={role} />;
}
