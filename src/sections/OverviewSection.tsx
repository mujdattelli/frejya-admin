import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, StatusMessage } from '../components/ui';

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

export function OverviewSection({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('rpc_admin_dashboard_stats');
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    setStats(data as Stats);
  }, []);

  // 31 May 2026: otomatik yenileme — realtime'a EK olarak 5 sn polling.
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);

  // Realtime: bekleyen iş sayaçları (foto/şikayet/destek/ban/üye) değişince
  // dashboard F5'siz canlı güncellensin — diğer sekmelerle tutarlı.
  useEffect(() => {
    const ch = supabase.channel('admin-overview-section');
    for (const table of ['public_profiles', 'suspicious_activities', 'support_tickets', 'private_users']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => load());
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  if (loading) return <Loading />;
  if (msg) return <StatusMessage text={msg} />;
  if (!stats) return null;

  // section: tıklanınca gidilecek sekme (Dashboard SECTIONS key'leri).
  const cards: { label: string; value: number; color: string; urgent?: boolean; section?: string }[] = [
    { label: 'Onay bekleyen fotoğraf', value: stats.pending_photos, color: '#C0A080', urgent: stats.pending_photos > 0, section: 'photos' },
    { label: 'Bekleyen şikayet', value: stats.pending_reports, color: '#EF4444', urgent: stats.pending_reports > 0, section: 'reports' },
    { label: 'Bekleyen destek talebi', value: stats.pending_tickets, color: '#14B8A6', urgent: stats.pending_tickets > 0, section: 'support' },
    { label: 'Banlı kullanıcı', value: stats.banned_users, color: '#F59E0B', section: 'banned' },
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
        {cards.map((c) => {
          const clickable = !!c.section && !!onNavigate;
          return (
            <div key={c.label}
              onClick={clickable ? () => onNavigate!(c.section!) : undefined}
              className={`bg-card rounded-xl p-4 border ${c.urgent ? 'border-current' : 'border-white/5'} ${
                clickable ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''
              }`}
              style={c.urgent ? { color: c.color } : undefined}>
              <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
              <p className="text-white/50 text-xs mt-1">{c.label}{clickable ? ' →' : ''}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
