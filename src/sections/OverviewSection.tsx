import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Genel Bakış — bekleyen iş + kullanıcı sayaçları (rpc_admin_dashboard_stats).
// 22 May 2026: panelde hiç özet yoktu; admin her sekmeyi tek tek açmak zorundaydı.
type Stats = {
  pending_photos: number;
  pending_reports: number;
  pending_tickets: number;
  banned_users: number;
  total_users: number;
  new_today: number;
};

export function OverviewSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('rpc_admin_dashboard_stats');
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    setStats(data as Stats);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-white/40 text-sm">Yükleniyor…</p>;
  if (msg) return <p className="text-red-400 text-sm">{msg}</p>;
  if (!stats) return null;

  const cards: { label: string; value: number; color: string; urgent?: boolean }[] = [
    { label: 'Onay bekleyen fotoğraf', value: stats.pending_photos, color: '#C0A080', urgent: stats.pending_photos > 0 },
    { label: 'Bekleyen şikayet', value: stats.pending_reports, color: '#EF4444', urgent: stats.pending_reports > 0 },
    { label: 'Bekleyen destek talebi', value: stats.pending_tickets, color: '#14B8A6', urgent: stats.pending_tickets > 0 },
    { label: 'Banlı kullanıcı', value: stats.banned_users, color: '#F59E0B' },
    { label: 'Toplam kullanıcı', value: stats.total_users, color: '#10B981' },
    { label: 'Bugün katılan', value: stats.new_today, color: '#A855F7' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-white/40 text-xs">Bekleyen işler ve kullanıcı özeti.</p>
        <button onClick={() => { setLoading(true); load(); }}
          className="text-xs text-white/60 border border-white/15 rounded-lg px-3 py-1.5 hover:bg-white/5">
          Yenile
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
        {cards.map((c) => (
          <div key={c.label}
            className={`bg-card rounded-xl p-4 border ${c.urgent ? 'border-current' : 'border-white/5'}`}
            style={c.urgent ? { color: c.color } : undefined}>
            <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
            <p className="text-white/50 text-xs mt-1">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
