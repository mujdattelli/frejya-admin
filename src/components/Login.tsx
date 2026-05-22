import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { BrandMark } from './ui';

// Master admin e-posta/şifre ile giriş — mobil uygulamayla aynı Supabase Auth.
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError('Giriş başarısız — e-posta veya şifre hatalı.');
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={handleLogin} className="w-full max-w-sm bg-card border border-white/10 rounded-2xl p-8">
        <div className="flex justify-center"><BrandMark size={34} textClass="text-2xl" /></div>
        <p className="text-white/40 text-xs text-center mb-6 mt-1.5">Yönetim Paneli</p>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="E-posta" autoComplete="email"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 mb-3 text-sm outline-none focus:border-primary/50"
        />
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Şifre" autoComplete="current-password"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 mb-3 text-sm outline-none focus:border-primary/50"
        />
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="w-full bg-primary text-black font-bold rounded-lg py-3 text-sm disabled:opacity-50"
        >
          {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
}
