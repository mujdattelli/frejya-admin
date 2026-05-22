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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: keys } = await supabase.from('system_settings').select('*').eq('id', 'api_keys').single();
      const k = keys as any;
      const norm = (x: any): ApiKey => (typeof x === 'string' ? { key: x } : x);
      setFreeKeys(Array.isArray(k?.free_keys) ? k.free_keys.map(norm) : []);
      setPaidKeys(Array.isArray(k?.paid_keys) ? k.paid_keys.map(norm) : []);
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
      <h3 className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2">Ücretsiz Havuz</h3>
      {freeKeys.length === 0 && <p className="text-white/40 text-xs mb-3">Anahtar yok.</p>}
      {freeKeys.map((k, i) => {
        const used = k.usage_count || 0;
        const total = k.limit || 1050;
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
