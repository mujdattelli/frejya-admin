import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading } from '../components/ui';

type ApiKey = {
  key: string; status?: string; usage_count?: number; limit?: number;
  dailyUsage?: number; [k: string]: unknown;
};

const maskKey = (k: string) =>
  !k || k.trim() === '' ? '(boş)' : k.length <= 8 ? k : `${k.slice(0, 5)}…${k.slice(-4)}`;

const StatusBadge = ({ status }: { status?: string }) => {
  if (status === 'dead') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">🔴 Ölü (403)</span>;
  }
  if (status === 'invalid') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0">🔴 Geçersiz (400)</span>;
  }
  if (status === 'exhausted') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 shrink-0">🟡 Kota Dolu</span>;
  }
  if (status === 'active') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">🟢 Aktif</span>;
  }
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/50 border border-white/10 shrink-0">{status || 'active'}</span>;
};

export function ApiMonitorSection() {
  const [freeKeys, setFreeKeys] = useState<ApiKey[]>([]);
  const [paidKeys, setPaidKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    const fetchKeys = async () => {
      const { data: keys } = await supabase.from('system_settings').select('*').eq('id', 'api_keys').single();
      if (!active) return;
      const k = keys as { free_keys?: unknown; paid_keys?: unknown } | null;
      const norm = (x: unknown): ApiKey => (typeof x === 'string' ? { key: x } : (x as ApiKey));
      setFreeKeys(Array.isArray(k?.free_keys) ? k.free_keys.map(norm) : []);
      setPaidKeys(Array.isArray(k?.paid_keys) ? k.paid_keys.map(norm) : []);
      setLastUpdate(new Date());
      setLoading(false);
    };
    fetchKeys();
    const interval = setInterval(fetchKeys, 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  if (loading) return <Loading />;

  const Bar = ({ used, total, color }: { used: number; total: number; color: string }) => (
    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
      <div className="h-full" style={{ width: `${Math.min(100, (used / (total || 1)) * 100)}%`, background: color }} />
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white/60 text-xs">
          CANLI · her 5 sn yenilenir{lastUpdate ? ` · son: ${lastUpdate.toLocaleTimeString('tr-TR')}` : ''}
        </span>
      </div>
      <h3 className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2">Ücretsiz Havuz</h3>
      {freeKeys.length === 0 && <p className="text-white/40 text-xs mb-3">Anahtar yok.</p>}
      {freeKeys.map((k, i) => {
        const used = k.dailyUsage ?? k.usage_count ?? 0;
        const total = k.limit || 1050;
        return (
          <div key={i} className="bg-card rounded-lg p-3 mb-2 border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-primary font-mono text-sm">{maskKey(k.key)}</span>
              <StatusBadge status={k.status} />
            </div>
            <Bar used={used} total={total} color="#10B981" />
            <p className="text-white/40 text-[10px] mt-1 text-right">{used} / {total}</p>
          </div>
        );
      })}

      <h3 className="text-red-400 text-xs font-bold uppercase tracking-widest mb-2 mt-4">Ücretli Havuz</h3>
      {paidKeys.length === 0 && <p className="text-white/40 text-xs">Anahtar yok.</p>}
      {paidKeys.map((k, i) => {
        const used = k.dailyUsage ?? k.usage_count ?? 0;
        const total = k.limit || 500;
        return (
          <div key={i} className="bg-card rounded-lg p-3 mb-2 border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-primary font-mono text-sm">{maskKey(k.key)}</span>
              <StatusBadge status={k.status} />
            </div>
            <Bar used={used} total={total} color="#EF4444" />
            <p className="text-white/40 text-[10px] mt-1 text-right">{used} / {total}</p>
          </div>
        );
      })}
    </div>
  );
}
