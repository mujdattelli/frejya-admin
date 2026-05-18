import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Karar Geçmişi — onaylanmış / reddedilmiş fotoğraflar (salt okunur).
type HistoryItem = {
  id: string;
  profile_picture_url: string | null;
  profile_picture_status: string;
  evaluated_by: string | null;
  evaluated_at: string | null;
  ai_rejection_reason: string | null;
  created_at: string | null;
};

export function HistorySection() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('public_profiles')
        .select('id, profile_picture_url, profile_picture_status, evaluated_by, evaluated_at, ai_rejection_reason, created_at')
        .in('profile_picture_status', ['APPROVED', 'REJECTED'])
        .order('created_at', { ascending: false })
        .limit(60);
      setLoading(false);
      if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
      setItems((data as HistoryItem[]) || []);
    })();
  }, []);

  if (loading) return <p className="text-white/40 text-sm">Yükleniyor…</p>;
  if (msg) return <p className="text-red-400 text-sm">{msg}</p>;
  if (items.length === 0) return <p className="text-white/40 text-sm">Geçmiş kayıt yok.</p>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((h) => {
        const approved = h.profile_picture_status === 'APPROVED';
        const evaluator = h.evaluated_by || '—';
        const dateStr = h.evaluated_at || h.created_at;
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
            <p className="text-white/30 text-[10px] font-mono truncate">{h.id.slice(0, 8)}… · {evaluator}</p>
          </div>
        );
      })}
    </div>
  );
}
