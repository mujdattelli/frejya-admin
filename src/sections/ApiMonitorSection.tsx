import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading } from '../components/ui';

// API İzleme — Gemini kotaları ve anahtar kullanımının salt-okunur görünümü.
type ApiKey = { key: string; status?: string; usage_count?: number; limit?: number; [k: string]: any };

const maskKey = (k: string) =>
  !k || k.trim() === '' ? '(boş)' : k.length <= 8 ? k : `${k.slice(0, 5)}…${k.slice(-4)}`;

export function ApiMonitorSection() {
  const [freeKeys, setFreeKeys] = useState<ApiKey[]>([]);
  const [paidKeys, setPaidKeys] = useState<ApiKey[]>([]);
  const [limits, setLimits] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: keys } = await supabase.from('system_settings').select('*').eq('id', 'api_keys').single();
      const { data: lim } = await supabase.from('system_settings').select('*').eq('id', 'api_keys_global_limits').single();
      const k = keys as any;
      const norm = (x: any): ApiKey => (typeof x === 'string' ? { key: x } : x);
      setFreeKeys(Array.isArray(k?.free_keys) ? k.free_keys.map(norm) : []);
      setPaidKeys(Array.isArray(k?.paid_keys) ? k.paid_keys.map(norm) : []);
      setLimits((lim as any) || {});
      setLoading(false);
    })();
  }, []);

  if (loading) return <Loading />;

  const Bar = ({ used, total, color }: { used: number; total: number; color: string }) => (
    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
      <div className="h-full" style={{ width: `${Math.min(100, (used / (total || 1)) * 100)}%`, background: color }} />
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="bg-card rounded-xl p-5 border-l-4 border-purple-500 border-y border-r border-white/5 mb-4">
        <h3 className="font-bold mb-2">Gemini Kotaları</h3>
        {/* Google, Free tier RPM/TPM/RPD değerlerini artık herkese açık
            rate-limits sayfasında YAYINLAMIYOR — yalnız giriş yapılmış AI
            Studio panelinde görünüyor. Bu yüzden otomatik çekme (scraper)
            mümkün değil; değerler Ayarlar → Gemini Kotaları'ndan manuel girilir. */}
        <p className="text-white/40 text-[11px] mb-3 leading-relaxed">
          Bu değerler <b>Google AI Studio</b> panelinden görülüp <b>Ayarlar →
          Gemini Kotaları</b>'ndan manuel girilir. (Google bu kotaları artık
          herkese açık bir sayfada yayınlamadığı için otomatik çekme yoktur.)
        </p>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <Stat label="Dakikalık İstek (RPM)" value={limits.gemini_rpm_limit}
            desc="Anahtar başına 60 saniyede yapılabilecek API çağrısı." />
          <Stat label="Dakikalık Token (TPM)" value={limits.gemini_tpm_limit}
            desc="60 saniyede işlenebilecek toplam token (girdi + çıktı)." />
          <Stat label="Günlük İstek (RPD)" value={limits.gemini_rpd_limit}
            desc="Anahtar başına 24 saatte çağrı (gece yarısı Pasifik'te sıfırlanır)." />
        </div>
      </div>

      <h3 className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2">Ücretsiz Havuz</h3>
      {freeKeys.length === 0 && <p className="text-white/40 text-xs mb-3">Anahtar yok.</p>}
      {freeKeys.map((k, i) => {
        const used = k.usage_count || 0;
        const total = k.limit || limits.gemini_safe_daily_limit || 1050;
        return (
          <div key={i} className="bg-card rounded-lg p-3 mb-2 border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-primary font-mono text-sm">{maskKey(k.key)}</span>
              <span className="text-white/50 text-xs capitalize">{k.status || 'active'}</span>
            </div>
            <Bar used={used} total={total} color="#10B981" />
            <p className="text-white/40 text-[10px] mt-1 text-right">{used} / {total}</p>
          </div>
        );
      })}

      <h3 className="text-red-400 text-xs font-bold uppercase tracking-widest mb-2 mt-4">Ücretli Havuz</h3>
      {paidKeys.length === 0 && <p className="text-white/40 text-xs">Anahtar yok.</p>}
      {paidKeys.map((k, i) => {
        const used = k.usage_count || 0;
        const total = k.limit || 500;
        return (
          <div key={i} className="bg-card rounded-lg p-3 mb-2 border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-primary font-mono text-sm">{maskKey(k.key)}</span>
              <span className="text-white/50 text-xs capitalize">{k.status || 'active'}</span>
            </div>
            <Bar used={used} total={total} color="#EF4444" />
            <p className="text-white/40 text-[10px] mt-1 text-right">{used} / {total}</p>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, desc }: { label: string; value: unknown; desc?: string }) {
  return (
    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
      <div className="flex justify-between items-baseline gap-3">
        <p className="text-white/60">{label}</p>
        <p className="text-emerald-400 font-bold text-sm">{value != null ? String(value) : '—'}</p>
      </div>
      {desc && <p className="text-white/35 text-[10px] mt-0.5">{desc}</p>}
    </div>
  );
}
