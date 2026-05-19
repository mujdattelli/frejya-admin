import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Google Authenticator (TOTP) ile iki adımlı doğrulama.
// Doğrulanmış faktör yoksa QR ile kayıt ekranı, varsa 6 haneli kod ekranı.
// Başarılı doğrulamada (oturum AAL2 olur) onVerified() çağrılır.
export function MfaGate({ onVerified }: { onVerified: () => void }) {
  const [mode, setMode] = useState<'loading' | 'enroll' | 'challenge'>('loading');
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) { setError(error.message); return; }
      const verified = data?.totp?.find((f) => f.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
        setMode('challenge');
        return;
      }
      // Yarım kalmış (unverified) faktörleri temizle, sonra yeni kayıt aç.
      for (const f of data?.totp ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: en, error: enErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (enErr) { setError(enErr.message); return; }
      setFactorId(en.id);
      setQr(en.totp.qr_code);
      setSecret(en.totp.secret);
      setMode('enroll');
    })();
  }, []);

  const verify = async () => {
    if (code.length !== 6) return;
    setBusy(true); setError('');
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) { setError(chErr.message); setBusy(false); return; }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
    setBusy(false);
    if (vErr) { setError('Kod hatalı veya süresi geçti — tekrar dene.'); setCode(''); return; }
    onVerified();
  };

  if (mode === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-white/40">Yükleniyor…</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-white/10 rounded-2xl p-8 text-center">
        <h1 className="text-xl font-serif text-primary">İki Adımlı Doğrulama</h1>
        {mode === 'enroll' ? (
          <>
            <p className="text-white/50 text-xs mt-1 mb-4">
              Google Authenticator uygulamasıyla bu QR kodu tara, sonra üretilen 6 haneli kodu gir.
            </p>
            {qr && <img src={qr} alt="QR" className="w-44 h-44 mx-auto bg-white rounded-lg p-2 mb-3" />}
            <p className="text-white/30 text-[10px] mb-4 break-all">
              QR okutamıyorsan anahtar: <span className="font-mono text-white/50">{secret}</span>
            </p>
          </>
        ) : (
          <p className="text-white/50 text-xs mt-1 mb-4">
            Google Authenticator'daki 6 haneli kodu gir.
          </p>
        )}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && verify()}
          placeholder="000000"
          inputMode="numeric"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-center text-lg tracking-[8px] outline-none focus:border-primary/50"
        />
        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
        <button
          onClick={verify}
          disabled={busy || code.length !== 6}
          className="w-full bg-primary text-black font-bold rounded-lg py-3 text-sm mt-4 disabled:opacity-50"
        >
          {busy ? 'Doğrulanıyor…' : 'Doğrula'}
        </button>
        <button onClick={() => supabase.auth.signOut()} className="mt-3 text-white/40 text-xs">
          Çıkış yap
        </button>
      </div>
    </div>
  );
}
