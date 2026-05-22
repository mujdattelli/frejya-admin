import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, EmptyState, StatusMessage } from '../components/ui';

// Karar Geçmişi — onaylanmış / reddedilmiş fotoğraflar (salt okunur).
// Veriler birden çok tablodan geldiği (public_profiles + audit_logs +
// private_users) ve cross-user RLS engellediği için master-only RPC kullanır.
type HistoryItem = {
  id: string;
  display_name: string | null;
  username: string | null;
  profile_picture_url: string | null;
  profile_picture_status: string;
  evaluator: string | null;
  decided_at: string | null;
  ai_rejection_reason: string | null;
  created_at: string | null;
};

type Filter = 'all' | 'approved' | 'rejected';

export function HistorySection() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = async () => {
    const { data, error } = await supabase.rpc('rpc_admin_list_photo_history');
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    setItems((data as HistoryItem[]) || []);
  };

  useEffect(() => {
    load();
    // Realtime: yeni bir karar verildiğinde geçmiş listesi F5 olmadan tazelensin.
    const channel = supabase
      .channel('admin-history-section')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'public_profiles' },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) return <Loading />;
  if (msg) return <StatusMessage text={msg} />;

  // Arama: isim/kullanıcı adı/red sebebi. Filtre: onaylı/reddedilen.
  const needle = q.trim().toLowerCase();
  const visible = items.filter((h) => {
    if (filter === 'approved' && h.profile_picture_status !== 'APPROVED') return false;
    if (filter === 'rejected' && h.profile_picture_status !== 'REJECTED') return false;
    if (!needle) return true;
    const hay = [h.display_name, h.username, h.ai_rejection_reason].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(needle);
  });

  const filterBtn = (f: Filter, label: string) => (
    <button onClick={() => setFilter(f)}
      className={`px-3 py-2 rounded-lg text-xs font-bold border ${
        filter === f ? 'bg-white/10 border-white/30' : 'border-white/10 text-white/50'
      }`}>
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="İsim veya red sebebinde ara…"
          className="flex-1 min-w-[180px] bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        {filterBtn('all', 'Tümü')}
        {filterBtn('approved', 'Onaylı')}
        {filterBtn('rejected', 'Reddedilen')}
      </div>
      {items.length === 0 ? (
        <EmptyState text="Geçmiş kayıt yok." />
      ) : visible.length === 0 ? (
        <EmptyState text="Aramanıza uyan kayıt yok." />
      ) : (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {visible.map((h) => {
        const approved = h.profile_picture_status === 'APPROVED';
        const evaluator = h.evaluator || 'AI';
        const dateStr = h.decided_at || h.created_at;
        return (
          <div key={h.id} className="bg-card rounded-xl p-3 border" style={{ borderColor: approved ? '#10B98150' : '#EF444450' }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-bold" style={{ color: approved ? '#10B981' : '#EF4444' }}>
                {evaluator === 'AI' ? '🤖' : '👤'} {approved ? 'Onaylandı' : 'Reddedildi'}
              </span>
              <span className="text-white/30 text-[10px]">
                {dateStr ? new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) : '—'}
              </span>
            </div>
            {h.profile_picture_url && (
              <img src={h.profile_picture_url} alt="" className="w-full h-36 object-cover rounded-lg mb-2" />
            )}
            {h.ai_rejection_reason && (
              <p className="text-red-400 text-[10px] bg-red-500/10 rounded p-1.5 mb-1">Sebep: {h.ai_rejection_reason}</p>
            )}
            <p className="text-white/80 text-[11px] font-bold truncate">{h.display_name || '—'}</p>
            <p className="text-white/30 text-[10px] truncate">
              {h.username ? '@' + h.username : h.id.slice(0, 8) + '…'} · {evaluator}
            </p>
          </div>
        );
      })}
      </div>
      )}
    </div>
  );
}
