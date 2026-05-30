import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, EmptyState, StatusMessage } from '../components/ui';
import { PostPreviewModal } from '../components/PostPreviewModal';

// Şikayet alıntısındaki `post_id:UUID`'yi ayıklar (Aura gönderi şikayetleri).
const extractPostId = (s: string | null | undefined): string | null => {
  const m = (s || '').match(/post_id:\s*([0-9a-fA-F-]{36})/);
  return m ? m[1] : null;
};

// Şikayetler — suspicious_activities; admin uyarı / ban / yok say kararı verir.
// 22 May 2026: karar artık master-only `rpc_admin_resolve_report` RPC'sinden
// geçer. Eski ham client yazımı bildirimleri RLS yüzünden sessizce kaybediyor,
// yanlış tabloya (public_profiles) ban/uyarı yazıyordu. Ayrıca: kullanıcı
// isimleri çözülür, realtime auto-refresh, sayfalama.
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

const PAGE = 30;

export function ReportsSection() {
  const [reports, setReports] = useState<Report[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [action, setAction] = useState<Action>('WARN');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewPostId, setPreviewPostId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('suspicious_activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    const pending = ((data as Report[]) || []).filter((r) => !r.status || r.status === 'pending');
    setReports(pending);
    setHasMore(((data as Report[]) || []).length === limit);

    // Şikayet eden + edilen isimlerini çöz — admin ham UUID görmesin.
    const ids = [...new Set(pending.flatMap((r) => [r.target_id, r.perpetrator_id]).filter(Boolean))];
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('public_profiles').select('id, display_name, username').in('id', ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p.display_name || p.username || p.id; });
      setNames(map);
    }
  }, [limit]);

  // 31 May 2026: otomatik yenileme — realtime'a EK olarak 5 sn polling.
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);

  // Realtime: yeni şikayet gelince liste F5'siz tazelensin.
  useEffect(() => {
    const ch = supabase
      .channel('admin-reports-section')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suspicious_activities' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const apply = async (r: Report) => {
    if (action !== 'IGNORE' && !note.trim()) { setMsg('Lütfen bir not yazın.'); return; }
    setBusy(true); setMsg('');
    const { error } = await supabase.rpc('rpc_admin_resolve_report', {
      p_report_id: r.id,
      p_action: action,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) { setMsg('İşlem başarısız: ' + error.message); return; }
    setReports((prev) => prev.filter((x) => x.id !== r.id));
    setOpenId(null); setNote(''); setAction('WARN');
    setMsg('Karar uygulandı ve ilgili kullanıcılara bildirildi.');
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Toplu işlem — seçili şikayetleri tek transaction'da "yok say" olarak kapatır.
  const bulkIgnore = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length} şikayet "yok say" olarak kapatılsın mı?`)) return;
    setBusy(true); setMsg('');
    const { data, error } = await supabase.rpc('rpc_admin_bulk_ignore_reports', { p_report_ids: ids });
    setBusy(false);
    if (error) { setMsg('Toplu işlem başarısız: ' + error.message); return; }
    setReports((prev) => prev.filter((x) => !selected.has(x.id)));
    setSelected(new Set());
    setMsg(`${(data as any)?.resolved ?? ids.length} şikayet yok sayıldı.`);
  };

  if (loading) return <Loading />;

  const nameOf = (id: string) => names[id] || id;

  // Kategori filtre seçenekleri — yüklü şikayetlerden türetilir.
  const categories = [...new Set(reports.map((r) => r.threat_category).filter(Boolean) as string[])].sort();

  // Arama: şikayet eden/edilen ismi + sebep + alıntı + kategori.
  const needle = q.trim().toLowerCase();
  const visible = reports.filter((r) => {
    if (catFilter && r.threat_category !== catFilter) return false;
    if (!needle) return true;
    const hay = [
      nameOf(r.target_id), nameOf(r.perpetrator_id),
      r.description, r.anonymized_snippet, r.threat_category,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(needle);
  });

  return (
    <div className="max-w-2xl">
      <div className="flex gap-2 mb-3 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="İsim, sebep veya alıntıda ara…"
          className="flex-1 min-w-[180px] bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500/50"
        />
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500/50"
        >
          <option value="">Tüm kategoriler</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(q || catFilter) && (
          <button onClick={() => { setQ(''); setCatFilter(''); }}
            className="px-3 py-2 text-xs text-white/50 border border-white/10 rounded-lg hover:bg-white/5">
            Temizle
          </button>
        )}
      </div>
      {/* Toplu işlem çubuğu — görünen şikayetler için topluca yok say. */}
      {visible.length > 0 && (
        <div className="flex items-center gap-3 mb-3 text-xs">
          <label className="flex items-center gap-1.5 text-white/60 cursor-pointer">
            <input
              type="checkbox"
              checked={visible.every((r) => selected.has(r.id))}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(visible.map((r) => r.id)) : new Set())
              }
            />
            Tümünü seç
          </label>
          {selected.size > 0 && (
            <>
              <span className="text-white/50">{selected.size} seçili</span>
              <button
                onClick={bulkIgnore}
                disabled={busy}
                className="ml-auto px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 font-bold text-white/80 disabled:opacity-50"
              >
                {busy ? 'İşleniyor…' : 'Seçilenleri Yok Say'}
              </button>
            </>
          )}
        </div>
      )}
      <StatusMessage text={msg} />
      {reports.length === 0 ? (
        <EmptyState text="Bekleyen şikayet yok." />
      ) : visible.length === 0 ? (
        <EmptyState text="Aramanıza uyan şikayet yok." />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((r) => (
            <div key={r.id} className="bg-card rounded-xl p-4 border-l-4 border-red-500 border-y border-r border-white/5">
              <div className="flex justify-between items-center mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                  />
                  <span className="text-red-400 font-bold text-[11px] uppercase tracking-widest">{r.threat_category || 'Şikayet'}</span>
                </label>
                <span className="text-white/40 text-[10px]">
                  {new Date(r.created_at || r.timestamp || Date.now()).toLocaleString('tr-TR')}
                </span>
              </div>
              <div className="bg-black/40 rounded-lg p-3 mb-3 text-[11px]">
                <p className="text-white/70 mb-1">Şikayet eden: <span className="text-white/90 font-bold">{nameOf(r.target_id)}</span></p>
                <p className="text-white/70 mb-1">Şikayet edilen: <span className="text-red-400 font-bold">{nameOf(r.perpetrator_id)}</span></p>
                {r.description && <p className="text-primary italic mt-1">Sebep: "{r.description}"</p>}
                {r.anonymized_snippet && <p className="text-white/50 mt-1">Alıntı: "{r.anonymized_snippet}"</p>}
                {(() => {
                  const pid = extractPostId(r.anonymized_snippet) || extractPostId(r.description);
                  return pid ? (
                    <button
                      onClick={() => setPreviewPostId(pid)}
                      className="mt-2 text-primary text-[11px] underline"
                    >
                      Şikayet edilen gönderiyi gör →
                    </button>
                  ) : null;
                })()}
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
          {hasMore && (
            <button onClick={() => setLimit((l) => l + PAGE)}
              className="py-2 text-xs text-white/50 border border-white/10 rounded-lg hover:bg-white/5">
              Daha fazla göster
            </button>
          )}
        </div>
      )}

      {previewPostId && (
        <PostPreviewModal postId={previewPostId} onClose={() => setPreviewPostId(null)} />
      )}
    </div>
  );
}
