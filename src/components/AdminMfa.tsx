import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BrandMark } from './ui';

type Mode = 'loading' | 'enroll' | 'challenge';

export function AdminMfa({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const init = useCallback(async () => {
    setErr('');
    try {
      const { data: factors, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verified = (factors?.totp || []).find((f) => f.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
        setMode('challenge');
        return;
      }
      const { data: enrolled, error: enrErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Frejya Admin ' + Date.now(),
      });
      if (enrErr) throw enrErr;
      setFactorId(enrolled.id);
      setQr(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setMode('enroll');
    } catch (e: any) {
      setErr('Başlatma hatası: ' + (e?.message || e));
    }
  }, []);

  useEffect(() => { init(); }, [init]);

  const verify = async () => {
    if (!factorId || code.trim().length !== 6) { setErr('6 haneli kodu girin.'); return; }
    setBusy(true); setErr('');
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId, challengeId: ch.id, code: code.trim(),
      });
      if (vErr) throw vErr;
      onDone();
    } catch (e: any) {
      setErr('Doğrulama başarısız — kod yanlış veya süresi dolmuş.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => supabase.auth.signOut();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-white/10 rounded-2xl p-8">
        <div className="flex justify-center"><BrandMark size={32} textClass="text-2xl" /></div>
        <p className="text-white/40 text-xs text-center mb-6 mt-1.5">İki Adımlı Doğrulama</p>

        {mode === 'loading' && <p className="text-white/40 text-sm text-center">Yükleniyor…</p>}

        {mode === 'enroll' && (
          <>
            <p className="text-white/60 text-xs mb-3 leading-relaxed">
              Hesabını korumak için iki adımlı doğrulama zorunludur. Authenticator
              uygulamanla (Google Authenticator, 1Password vb.) aşağıdaki QR kodu okut,
              sonra üretilen 6 haneli kodu gir.
            </p>
            {qr && (
              <div className="flex justify-center mb-3">
                <img src={qr} alt="QR" className="w-44 h-44 bg-white rounded-lg p-2" />
              </div>
            )}
            {secret && (
              <p className="text-white/40 text-[10px] text-center mb-4 font-mono break-all">
                Kod okutamıyorsan anahtar: {secret}
              </p>
            )}
          </>
        )}

        {mode === 'challenge' && (
          <p className="text-white/60 text-xs mb-4 leading-relaxed">
            Authenticator uygulamandaki 6 haneli kodu gir.
          </p>
        )}

        {(mode === 'enroll' || mode === 'challenge') && (
          <>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && verify()}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 mb-3 text-center text-lg tracking-[6px] font-mono outline-none focus:border-primary/50"
            />
            {err && <p className="text-red-400 text-xs mb-3">{err}</p>}
            <button
              onClick={verify}
              disabled={busy || code.length !== 6}
              className="w-full bg-primary text-black font-bold rounded-lg py-3 text-sm disabled:opacity-50"
            >
              {busy ? 'Doğrulanıyor…' : 'Doğrula'}
            </button>
          </>
        )}

        {mode === 'loading' && err && <p className="text-red-400 text-xs mt-3">{err}</p>}

        <button onClick={signOut} className="w-full mt-3 text-white/40 text-xs hover:text-white/60">
          Çıkış Yap
        </button>
      </div>
    </div>
  );
}
