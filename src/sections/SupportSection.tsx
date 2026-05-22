import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, EmptyState, StatusMessage } from '../components/ui';

// İstekler — kullanıcı destek/dilek talepleri (support_tickets, status='pending').
// 22 May 2026: yanıt artık master-only `rpc_admin_reply_ticket` RPC'sinden geçer
// (ham client INSERT bildirimi RLS yüzünden sessizce kayboluyordu). Ayrıca:
// gönderen ismi çözülür, realtime auto-refresh, sayfalama.
type Ticket = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
};

const PAGE = 30;

export function SupportSection() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, sender_id, message, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit);
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    const rows = (data as Ticket[]) || [];
    setTickets(rows);
    setHasMore(rows.length === limit);

    // Gönderen isimlerini çöz — admin ham UUID değil isim görsün.
    const ids = [...new Set(rows.map((r) => r.sender_id).filter(Boolean))];
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('public_profiles').select('id, display_name, username').in('id', ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p.display_name || p.username || p.id; });
      setNames(map);
    }
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  // Realtime: yeni destek talebi gelince / çözülünce liste F5'siz tazelensin.
  useEffect(() => {
    const ch = supabase
      .channel('admin-support-section')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const sendReply = async (ticket: Ticket) => {
    if (!reply.trim()) return;
    setBusy(true); setMsg('');
    const { error } = await supabase.rpc('rpc_admin_reply_ticket', {
      p_ticket_id: ticket.id,
      p_reply: reply.trim(),
    });
    setBusy(false);
    if (error) { setMsg('Hata: ' + error.message); return; }
    setTickets((prev) => prev.filter((x) => x.id !== ticket.id));
    setOpenId(null);
    setReply('');
    setMsg('Yanıt gönderildi ve kullanıcıya bildirildi.');
  };

  if (loading) return <Loading />;

  // Arama: gönderen ismi + mesaj içeriği.
  const needle = q.trim().toLowerCase();
  const visible = tickets.filter((t) => {
    if (!needle) return true;
    const hay = [names[t.sender_id] || t.sender_id, t.message].join(' ').toLowerCase();
    return hay.includes(needle);
  });

  return (
    <div className="max-w-2xl">
      <div className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Kullanıcı veya mesaj içeriğinde ara…"
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-500/50"
        />
        {q && (
          <button onClick={() => setQ('')}
            className="px-3 py-2 text-xs text-white/50 border border-white/10 rounded-lg hover:bg-white/5">
            Temizle
          </button>
        )}
      </div>
      <StatusMessage text={msg} />
      {tickets.length === 0 ? (
        <EmptyState text="Bekleyen destek talebi yok." />
      ) : visible.length === 0 ? (
        <EmptyState text="Aramanıza uyan talep yok." />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((ticket) => (
            <div key={ticket.id} className="bg-card rounded-xl p-4 border-l-4 border-teal-500 border-y border-r border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-teal-400 font-bold text-[11px] uppercase tracking-widest">Destek Talebi</span>
                <span className="text-white/40 text-[10px]">{new Date(ticket.created_at).toLocaleString('tr-TR')}</span>
              </div>
              <p className="text-white/60 text-[11px] mb-2 truncate">
                Kullanıcı: <span className="text-white/80 font-bold">{names[ticket.sender_id] || ticket.sender_id}</span>
              </p>
              <p className="text-primary text-sm italic bg-black/40 rounded-lg p-3 mb-3">"{ticket.message}"</p>

              {openId === ticket.id ? (
                <div>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Yanıtınızı yazın…"
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-sm min-h-[80px] outline-none focus:border-teal-500/50"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => { setOpenId(null); setReply(''); }}
                      className="px-4 py-2 rounded-lg border border-white/20 text-xs">İptal</button>
                    <button onClick={() => sendReply(ticket)} disabled={busy}
                      className="px-4 py-2 rounded-lg bg-teal-500 text-black font-bold text-xs disabled:opacity-50">
                      {busy ? 'Gönderiliyor…' : 'Gönder'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setOpenId(ticket.id); setReply(''); }}
                  className="w-full py-2 bg-teal-500/15 border border-teal-500/30 text-teal-400 font-bold text-xs rounded-lg">
                  Yanıtla
                </button>
              )}
            </div>
          ))}
          {hasMore && (
            <button onClick={() => setLimit((l) => l + PAGE)}
              className="py-2 text-xs text-white/50 border border-white/10 rounded-lg hover:bg-white/5">
              Daha fazla göster
            </button>
          )}
        </div>
      )}
    </div>
  );
}
