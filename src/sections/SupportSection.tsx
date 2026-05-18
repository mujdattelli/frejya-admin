import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// İstekler — kullanıcı destek/dilek talepleri (support_tickets, status='pending').
type Ticket = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
};

export function SupportSection() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, sender_id, message, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      setLoading(false);
      if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
      setTickets((data as Ticket[]) || []);
    })();
  }, []);

  const sendReply = async (ticket: Ticket) => {
    if (!reply.trim()) return;
    setBusy(true); setMsg('');
    const { error } = await supabase
      .from('support_tickets')
      .update({ status: 'resolved', admin_reply: reply })
      .eq('id', ticket.id);
    if (error) { setMsg('Hata: ' + error.message); setBusy(false); return; }
    await supabase.from('system_notifications').insert({
      user_id: ticket.sender_id,
      title: 'Destek Talebinize Yanıt Geldi',
      message: reply,
      is_read: false,
    });
    setTickets((prev) => prev.filter((x) => x.id !== ticket.id));
    setOpenId(null);
    setReply('');
    setMsg('Yanıt gönderildi.');
    setBusy(false);
  };

  if (loading) return <p className="text-white/40 text-sm">Yükleniyor…</p>;

  return (
    <div className="max-w-2xl">
      {msg && <p className="text-white/50 text-xs mb-4">{msg}</p>}
      {tickets.length === 0 ? (
        <p className="text-white/40 text-sm">Bekleyen destek talebi yok.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="bg-card rounded-xl p-4 border-l-4 border-teal-500 border-y border-r border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-teal-400 font-bold text-[11px] uppercase tracking-widest">Destek Talebi</span>
                <span className="text-white/40 text-[10px]">{new Date(ticket.created_at).toLocaleString('tr-TR')}</span>
              </div>
              <p className="text-white/60 text-[11px] font-mono mb-2 truncate">Kullanıcı: {ticket.sender_id}</p>
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
        </div>
      )}
    </div>
  );
}
