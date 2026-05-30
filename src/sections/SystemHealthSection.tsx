import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading } from '../components/ui';

// Sistem Sağlığı — cron + foto kuyruğu + AI 24h + arşiv (master-only, salt okuma).
// 31 May 2026 Faz 1: "Göremediğin şeyi yönetemezsin." Cron sessizce ölürse,
// kuyruk şişerse, AI çökerse buradan ANINDA görülür. 10 sn otomatik yenilenir.
type Cron = { jobname: string; schedule: string; active: boolean; last_run: string | null; last_status: string | null };
type Health = {
  crons: Cron[];
  photo_queue: { pending: number; processing: number; needs_manual: number };
  ai_last24h: { success: number; crash: number };
  archived_msgs: number;
  checked_at: string;
};

// Cron'un beklenen aralığına göre "son çalışma çok mu eski?" — sağlık rengi.
function cronStale(c: Cron): boolean {
  if (!c.active) return false; // pasif cron "stale" değil, kasıtlı kapalı
  if (!c.last_run) return true; // hiç çalışmamış → şüpheli
  const ageMin = (Date.now() - new Date(c.last_run).getTime()) / 60000;
  // Dakikalık cron (* * * * * veya '30 seconds') → 5 dk'dan eski = sorun.
  // Günlük cron → 26 saatten eski = sorun. Basit eşik.
  const isFrequent = c.schedule.includes('* * * * *') || c.schedule.toLowerCase().includes('second');
  return isFrequent ? ageMin > 5 : ageMin > 26 * 60;
}

export function SystemHealthSection() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

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
    const id = setInterval(load, 10000); // 10 sn canlı yenile
    return () => { active = false; clearInterval(id); };
  }, []);

  if (loading) return <Loading />;
  if (err) return <p className="text-red-400 text-sm">Yükleme hatası: {err}</p>;
  if (!data) return null;

  const q = data.photo_queue;
  const ai = data.ai_last24h;
  const queueWarn = q.pending > 50; // kuyruk şişmesi uyarısı
  const aiWarn = ai.crash > ai.success && ai.crash > 5; // çökmeler başarıdan fazla

  const Card = ({ title, value, sub, warn }: { title: string; value: string | number; sub?: string; warn?: boolean }) => (
    <div className="bg-card rounded-xl p-4 border" style={{ borderColor: warn ? '#EF444460' : '#ffffff14' }}>
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

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card title="Foto Kuyruğu (bekleyen)" value={q.pending} sub={`işlenen: ${q.processing}`} warn={queueWarn} />
        <Card title="Manuel İnceleme" value={q.needs_manual} warn={q.needs_manual > 0} />
        <Card title="AI 24s Başarı" value={ai.success} sub={`çökme: ${ai.crash}`} warn={aiWarn} />
        <Card title="Arşiv Mesaj (15g)" value={data.archived_msgs} />
      </div>

      {queueWarn && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-300 text-xs">
          ⚠️ Foto kuyruğu şişiyor ({q.pending} bekliyor). Worker yetişemiyor olabilir — cron + Gemini kotasını kontrol et.
        </div>
      )}

      {/* Cron tablosu */}
      <h3 className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2">Cron İşleri</h3>
      <div className="space-y-1.5">
        {data.crons.map((c) => {
          const stale = cronStale(c);
          const dot = !c.active ? '#6B7280' : stale ? '#EF4444' : '#10B981';
          return (
            <div key={c.jobname} className="bg-card rounded-lg p-3 border border-white/5 flex items-center gap-3">
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
            </div>
          );
        })}
      </div>
      <p className="text-white/30 text-[10px] mt-3">
        🟢 sağlıklı · 🔴 gecikmiş/hiç çalışmamış · ⚪ kasıtlı kapalı. Dakikalık cron 5 dk, günlük cron 26 saat eşiğiyle değerlendirilir.
      </p>
    </div>
  );
}
