import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading } from '../components/ui';

// Sistem Sağlığı v3 — cron + foto + AI + arşiv + PUSH HEALTH + manuel tetikleme
// + AI hata listesi (master-only, 2 Haz 2026 v3 eklentileri).
// 31 May 2026 Faz 1: tanı. 2 Haz 2026 Faz 2: müdahale (manuel cron + AI detay).
type Cron = {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_status: string | null;
  last_error: string | null;
};
type Health = {
  crons: Cron[];
  photo_queue: { pending: number; processing: number; needs_manual: number };
  ai_last24h: { success: number; crash: number };
  archived_msgs: number;
  push_health: { total_active: number; with_token: number; valid_expo: number };
  checked_at: string;
};
type AiFailure = {
  created_at: string;
  user_id: string | null;
  display_name: string | null;
  details: any;
  level: string | null;
};

// Cron tazelik eşiği — dakikalık cron 5 dk, günlük cron 26 saat.
function cronStale(c: Cron): boolean {
  if (!c.active) return false;
  if (!c.last_run) return true;
  const ageMin = (Date.now() - new Date(c.last_run).getTime()) / 60000;
  const isFrequent = c.schedule.includes('* * * * *') || c.schedule.toLowerCase().includes('second');
  return isFrequent ? ageMin > 5 : ageMin > 26 * 60;
}

export function SystemHealthSection() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  // v3: her cron için "çalıştır" durumu + son sonuç (success/error mesajı)
  const [runStatus, setRunStatus] = useState<Record<string, { running?: boolean; result?: string; ok?: boolean }>>({});
  // v3: AI hata listesi (accordion, AI 24s kart'ına tıklayınca açılır)
  const [aiOpen, setAiOpen] = useState(false);
  const [aiFails, setAiFails] = useState<AiFailure[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: d, error } = await supabase.rpc('rpc_admin_system_health');
      if (!active) return;
      if (error) { setErr(error.message); setLoading(false); return; }
      setData(d as Health);
      setLoading(false);
    };
    load();
    const id = setInterval(load, 10000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Manuel cron tetikle (kullanıcı "pg_cron yapsan" — cron.command'ı server-side PERFORM)
  const runCron = async (jobname: string) => {
    setRunStatus(s => ({ ...s, [jobname]: { running: true } }));
    try {
      const { data: r, error } = await supabase.rpc('rpc_admin_run_cron', { p_jobname: jobname });
      if (error) {
        setRunStatus(s => ({ ...s, [jobname]: { result: `RPC hata: ${error.message}`, ok: false } }));
        return;
      }
      const res = r as { success: boolean; duration_ms?: number; error?: string };
      if (res.success) {
        setRunStatus(s => ({ ...s, [jobname]: { result: `✅ ${res.duration_ms ?? 0} ms`, ok: true } }));
      } else {
        setRunStatus(s => ({ ...s, [jobname]: { result: `❌ ${res.error || 'hata'}`, ok: false } }));
      }
    } catch (e: any) {
      setRunStatus(s => ({ ...s, [jobname]: { result: `İstisna: ${e?.message || e}`, ok: false } }));
    }
  };

  const toggleAiFails = async () => {
    if (aiOpen) { setAiOpen(false); return; }
    setAiOpen(true);
    if (aiFails === null) {
      setAiLoading(true);
      const { data: r, error } = await supabase.rpc('rpc_admin_ai_failures', { p_limit: 30 });
      if (!error) setAiFails((r as AiFailure[]) || []);
      setAiLoading(false);
    }
  };

  if (loading) return <Loading />;
  if (err) return <p className="text-red-400 text-sm">Yükleme hatası: {err}</p>;
  if (!data) return null;

  const q = data.photo_queue;
  const ai = data.ai_last24h;
  const ph = data.push_health;
  const queueWarn = q.pending > 50;
  const aiWarn = ai.crash > ai.success && ai.crash > 5;
  // Push warn: kullanıcıların yarısından azı geçerli token taşıyorsa "bildirim
  // ulaşmıyor" şüphesi var. 100 user altı küçük örnek için warn'ı bastır.
  const pushWarn = ph.total_active >= 100 && ph.valid_expo < ph.total_active * 0.5;

  const Card = ({ title, value, sub, warn, onClick }: { title: string; value: string | number; sub?: string; warn?: boolean; onClick?: () => void }) => (
    <div
      onClick={onClick}
      className={`bg-card rounded-xl p-4 border ${onClick ? 'cursor-pointer hover:border-primary/40 transition' : ''}`}
      style={{ borderColor: warn ? '#EF444460' : '#ffffff14' }}
    >
      <p className="text-white/50 text-xs uppercase tracking-wider mb-1">{title}</p>
      <p className="text-2xl font-bold" style={{ color: warn ? '#EF4444' : '#fff' }}>{value}</p>
      {sub && <p className="text-white/40 text-[11px] mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white/60 text-xs">CANLI · 10 sn · son: {new Date(data.checked_at).toLocaleTimeString('tr-TR')}</span>
      </div>

      {/* v3: 5 özet kart (push_health eklendi). AI kart'ı tıklanır → hata listesi */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card title="Foto Kuyruğu" value={q.pending} sub={`işlenen: ${q.processing}`} warn={queueWarn} />
        <Card title="Manuel İnceleme" value={q.needs_manual} warn={q.needs_manual > 0} />
        <Card title="AI 24s · tıkla" value={ai.success} sub={`çökme: ${ai.crash}`} warn={aiWarn} onClick={toggleAiFails} />
        <Card title="Push Token" value={`${ph.valid_expo}/${ph.total_active}`} sub={`token: ${ph.with_token}`} warn={pushWarn} />
        <Card title="Arşiv Mesaj" value={data.archived_msgs} />
      </div>

      {queueWarn && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-300 text-xs">
          ⚠️ Foto kuyruğu şişiyor ({q.pending} bekliyor). Worker yetişemiyor olabilir — cron + Gemini kotasını kontrol et.
        </div>
      )}
      {pushWarn && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-300 text-xs">
          ⚠️ Geçerli Expo token oranı düşük: {ph.valid_expo}/{ph.total_active}. Kullanıcıların yarısından azı bildirim alabilir.
        </div>
      )}

      {/* v3: AI hata listesi (accordion) */}
      {aiOpen && (
        <div className="bg-card rounded-lg p-3 border border-white/5 mb-6">
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2">AI 24s Hata Listesi (en son 30)</p>
          {aiLoading && <p className="text-white/40 text-xs">Yükleniyor…</p>}
          {!aiLoading && aiFails && aiFails.length === 0 && (
            <p className="text-white/40 text-xs">Son 24 saatte AI hatası yok 🎉</p>
          )}
          {!aiLoading && aiFails && aiFails.length > 0 && (
            <div className="space-y-1 max-h-64 overflow-auto">
              {aiFails.map((f, idx) => (
                <div key={idx} className="bg-black/30 rounded p-2 text-[11px]">
                  <div className="flex justify-between text-white/60">
                    <span className="font-mono">{new Date(f.created_at).toLocaleString('tr-TR')}</span>
                    <span>{f.display_name || '—'} · {(f.user_id || '').slice(0, 8)}</span>
                  </div>
                  <pre className="text-white/80 mt-1 whitespace-pre-wrap break-words font-mono text-[10px]">
                    {typeof f.details === 'string' ? f.details : JSON.stringify(f.details, null, 0)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* v3: Cron tablosu — son hata + Çalıştır butonu eklendi */}
      <h3 className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2">Cron İşleri</h3>
      <div className="space-y-1.5">
        {data.crons.map((c) => {
          const stale = cronStale(c);
          const dot = !c.active ? '#6B7280' : stale ? '#EF4444' : '#10B981';
          const rs = runStatus[c.jobname];
          return (
            <div key={c.jobname} className="bg-card rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dot }} />
                <div className="flex-1 min-w-0">
                  <p className="text-white/90 text-sm font-mono truncate">{c.jobname}</p>
                  <p className="text-white/40 text-[10px]">{c.schedule} · {c.active ? 'aktif' : 'pasif'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white/60 text-[11px]">
                    {c.last_run ? new Date(c.last_run).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'hiç çalışmadı'}
                  </p>
                  <p className="text-[10px]" style={{ color: c.last_status === 'succeeded' ? '#10B981' : c.last_status ? '#F59E0B' : '#6B7280' }}>
                    {c.last_status || '—'}{stale && c.active ? ' · GECİKMİŞ' : ''}
                  </p>
                </div>
                <button
                  onClick={() => runCron(c.jobname)}
                  disabled={rs?.running}
                  className="ml-2 px-2.5 py-1 rounded text-[10px] font-bold bg-primary/15 border border-primary/40 hover:bg-primary/25 disabled:opacity-40 shrink-0"
                  title="Bu cron'u şimdi tetikle (cron.command PERFORM)"
                >
                  {rs?.running ? '…' : 'Çalıştır'}
                </button>
              </div>
              {/* v3: son HATA mesajı (varsa) — kırmızı şerit */}
              {c.last_error && (
                <div className="mt-2 pl-5 text-[10px] text-red-300/80 font-mono truncate" title={c.last_error}>
                  ❌ {c.last_error}
                </div>
              )}
              {/* v3: manuel çalıştırma sonucu */}
              {rs?.result && (
                <div className="mt-1 pl-5 text-[10px] font-mono" style={{ color: rs.ok ? '#10B981' : '#EF4444' }}>
                  {rs.result}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-white/30 text-[10px] mt-3">
        🟢 sağlıklı · 🔴 gecikmiş/hiç çalışmamış · ⚪ kasıtlı kapalı. Dakikalık cron 5 dk, günlük cron 26 saat eşiğiyle değerlendirilir.
        "Çalıştır" → cron.command tek seferlik tetiklenir, schedule değişmez.
      </p>
    </div>
  );
}
