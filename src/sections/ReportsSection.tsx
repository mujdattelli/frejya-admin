import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Şikayetler — suspicious_activities; admin uyarı / ban / yok say kararı verir.
type Report = {
  id: string;
  threat_category: string | null;
  created_at: string | null;
  timestamp: string | null;
  target_id: string;
  perpetrator_id: string;
  description: string | null;
  anonymized_snippet: string | null;
  status: string | null;
};

type Action = 'WARN' | 'BAN' | 'IGNORE';

export function ReportsSection() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [action, setAction] = useState<Action>('WARN');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('suspicious_activities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setLoading(false);
      if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
      setReports(((data as Report[]) || []).filter((r) => !r.status || r.status === 'pending'));
    })();
  }, []);

  const apply = async (r: Report) => {
    if (action !== 'IGNORE' && !note.trim()) { setMsg('Lütfen bir not yazın.'); return; }
    setBusy(true); setMsg('');
    try {
      const { data: perp } = await supabase
        .from('public_profiles').select('display_name, username').eq('id', r.perpetrator_id).single();
      const perpName = (perp as any)?.display_name || (perp as any)?.username || 'Kullanıcı';

      if (action === 'WARN') {
        const { data: b } = await supabase
          .from('public_profiles').select('warning_count').eq('id', r.perpetrator_id).single();
        await supabase.from('public_profiles')
          .update({ warning_count: ((b as any)?.warning_count || 0) + 1 }).eq('id', r.perpetrator_id);
        await supabase.from('system_notifications').insert({
          user_id: r.perpetrator_id, title: 'Topluluk Kuralları Uyarısı',
          message: `Bu davranışınızdan dolayı uyarıldınız, tekrarı banla sonuçlanır. Uyarı: ${note}`, is_read: false,
        });
        await supabase.from('suspicious_activities').update({ status: 'resolved_warned' }).eq('id', r.id);
      } else if (action === 'BAN') {
        await supabase.from('public_profiles').update({ is_banned: true }).eq('id', r.perpetrator_id);
        await supabase.from('system_notifications').insert({
          user_id: r.perpetrator_id, title: 'Hesabınız Kapatıldı',
          message: `Topluluk kurallarını ihlal ettiğiniz için hesabınız kalıcı olarak kapatıldı. Neden: ${note}`, is_read: false,
        });
        await supabase.from('suspicious_activities').update({ status: 'resolved_banned' }).eq('id', r.id);
      } else {
        await supabase.from('suspicious_activities').update({ status: 'resolved_ignored' }).eq('id', r.id);
      }

      const resultStr = action === 'WARN' ? `${perpName} uyarıldı.` : action === 'BAN' ? `${perpName} banlandı.` : 'Şikayetiniz geçersiz sayıldı.';
      await supabase.from('system_notifications').insert({
        user_id: r.target_id, title: 'Şikayet Sonucu',
        message: `${resultStr} Admin Notu: ${note || '-'}`, is_read: false,
      });

      setReports((prev) => prev.filter((x) => x.id !== r.id));
      setOpenId(null); setNote(''); setAction('WARN');
      setMsg('Karar uygulandı.');
    } catch (e: any) {
      setMsg('İşlem başarısız: ' + (e?.message || ''));
    }
    setBusy(false);
  };

  if (loading) return <p className="text-white/40 text-sm">Yükleniyor…</p>;

  return (
    <div className="max-w-2xl">
      {msg && <p className="text-white/50 text-xs mb-4">{msg}</p>}
      {reports.length === 0 ? (
        <p className="text-white/40 text-sm">Bekleyen şikayet yok.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r) => (
            <div key={r.id} className="bg-card rounded-xl p-4 border-l-4 border-red-500 border-y border-r border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-red-400 font-bold text-[11px] uppercase tracking-widest">{r.threat_category || 'Şikayet'}</span>
                <span className="text-white/40 text-[10px]">
                  {new Date(r.created_at || r.timestamp || Date.now()).toLocaleString('tr-TR')}
                </span>
              </div>
              <div className="bg-black/40 rounded-lg p-3 mb-3 text-[11px] font-mono">
                <p className="text-white/70 mb-1">Şikayet eden: {r.target_id}</p>
                <p className="text-white/70 mb-1">Şikayet edilen: <span className="text-red-400 font-bold">{r.perpetrator_id}</span></p>
                {r.description && <p className="text-primary italic mt-1">Sebep: "{r.description}"</p>}
                {r.anonymized_snippet && <p className="text-white/50 mt-1">Alıntı: "{r.anonymized_snippet}"</p>}
              </div>

              {openId === r.id ? (
                <div>
                  <div className="flex gap-2 mb-2">
                    {(['WARN', 'BAN', 'IGNORE'] as Action[]).map((a) => (
                      <button key={a} onClick={() => setAction(a)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border ${
                          action === a ? 'bg-white/10 border-white/30' : 'border-white/10 text-white/50'
                        }`}>
                        {a === 'WARN' ? 'Uyar' : a === 'BAN' ? 'Banla' : 'Yok Say'}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder={action === 'IGNORE' ? 'Not (opsiyonel)…' : 'Admin notu…'}
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-sm min-h-[70px] outline-none focus:border-red-500/50"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => { setOpenId(null); setNote(''); }} className="px-4 py-2 rounded-lg border border-white/20 text-xs">İptal</button>
                    <button onClick={() => apply(r)} disabled={busy}
                      className="px-4 py-2 rounded-lg bg-red-500 text-white font-bold text-xs disabled:opacity-50">
                      {busy ? 'Uygulanıyor…' : 'Kararı Uygula'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setOpenId(r.id); setNote(''); setAction('WARN'); }}
                  className="w-full py-2 bg-blue-500/15 border border-blue-500/40 text-blue-400 font-bold text-xs rounded-lg">
                  İncele & Karar Ver
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
