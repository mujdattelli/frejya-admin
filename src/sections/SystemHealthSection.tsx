import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading } from '../components/ui';

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
  const [runStatus, setRunStatus] = useState<Record<string, { running?: boolean; result?: string; ok?: boolean }>>({});
  const [aiOpen, setAiOpen] = useState(false);
  const [aiFails, setAiFails] = useState<AiFailure[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [e2eeUserId, setE2eeUserId] = useState('');
  const [e2eeResult, setE2eeResult] = useState<any>(null);
  const [e2eeLoading, setE2eeLoading] = useState(false);
  const [testPushUserId, setTestPushUserId] = useState('');
  const [testPushResult, setTestPushResult] = useState<any>(null);
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [branches, setBranches] = useState<any[] | null>(null);
  const [branchErr, setBranchErr] = useState('');

  const checkE2ee = async () => {
    const id = e2eeUserId.trim();
    if (!id) { setE2eeResult({ note: 'Kullanıcı UUID gir.' }); return; }
    setE2eeLoading(true);
    setE2eeResult(null);
    try {
      const { data, error } = await supabase.rpc('rpc_admin_check_e2ee', { p_target_id: id });
      if (error) { setE2eeResult({ note: 'RPC hata: ' + error.message }); }
      else { setE2eeResult(data); }
    } catch (e: any) {
      setE2eeResult({ note: 'İstisna: ' + (e?.message || e) });
    } finally {
      setE2eeLoading(false);
    }
  };

  const sendTestPush = async () => {
    const id = testPushUserId.trim();
    if (!id) { setTestPushResult({ note: 'Kullanıcı UUID gir.' }); return; }
    setTestPushLoading(true);
    setTestPushResult(null);
    try {
      const { data, error } = await supabase.rpc('rpc_admin_test_push', { p_target_id: id });
      if (error) { setTestPushResult({ note: 'RPC hata: ' + error.message }); }
      else { setTestPushResult(data); }
    } catch (e: any) {
      setTestPushResult({ note: 'İstisna: ' + (e?.message || e) });
    } finally {
      setTestPushLoading(false);
    }
  };

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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('admin-branch-status');
        if (!active) return;
        if (error) { setBranchErr(error.message); return; }
        const d = data as any;
        if (d?.error) { setBranchErr(d.note || d.error); return; }
        setBranches(d?.branches || []);
      } catch (e: any) { if (active) setBranchErr(e?.message || String(e)); }
    })();
    return () => { active = false; };
  }, []);

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
              {c.last_error && (
                <div className="mt-2 pl-5 text-[10px] text-red-300/80 font-mono truncate" title={c.last_error}>
                  ❌ {c.last_error}
                </div>
              )}
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

      <h3 className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2 mt-8">Supabase Branch'leri</h3>
      <div className="bg-card rounded-lg p-3 border border-white/5">
        {branchErr && <p className="text-amber-300 text-[11px]">⚠️ {branchErr}</p>}
        {!branchErr && branches === null && <p className="text-white/40 text-xs">Yükleniyor…</p>}
        {!branchErr && branches && branches.length === 0 && <p className="text-white/40 text-xs">Preview branch yok (yalnız production).</p>}
        {!branchErr && branches && branches.map((b: any, i: number) => {
          const failed = String(b.status || '').toUpperCase().includes('FAILED');
          const healthy = !failed && (b.status === 'FUNCTIONS_DEPLOYED' || b.status === 'MIGRATIONS_PASSED' || b.preview_status === 'ACTIVE_HEALTHY');
          const dot = failed ? '#EF4444' : healthy ? '#10B981' : '#F59E0B';
          return (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dot }} />
              <div className="flex-1 min-w-0">
                <p className="text-white/90 text-sm font-mono truncate">{b.name}{b.is_default ? ' · production' : ''}</p>
                <p className="text-white/40 text-[10px]">{b.status}{b.preview_status ? ` · ${b.preview_status}` : ''}{b.with_data === false ? ' · veri yok' : ''}</p>
              </div>
              {b.updated_at && <span className="text-white/40 text-[10px] shrink-0">{new Date(b.updated_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          );
        })}
        <p className="text-white/30 text-[10px] mt-2">🔴 MIGRATIONS_FAILED → preview branch bozuk (yeni branch git main'i replay eder). 🟢 sağlıklı · ⚪ diğer. Management PAT Edge Function'da tutulur (client'ta DEĞİL).</p>
      </div>

      <h3 className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2 mt-8">E2EE Sağlığı Kontrolü</h3>
      <div className="bg-card rounded-lg p-3 border border-white/5">
        <p className="text-white/40 text-[11px] mb-2 leading-relaxed">
          Kullanıcı UUID gir → o kullanıcının NaCl anahtar çifti durumu raporlanır:
          public key DB'de mi (mesaj alabilir mi), Yol B yedeği var mı (yeni cihazda restore olur mu).
          <span className="text-white/30"> Bu Test Push'tan AYRI — push token başka şey.</span>
        </p>
        <div className="flex gap-2">
          <input
            value={e2eeUserId}
            onChange={(e) => setE2eeUserId(e.target.value)}
            placeholder="Kullanıcı UUID"
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/50 font-mono"
          />
          <button
            onClick={checkE2ee}
            disabled={e2eeLoading}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-primary/20 border border-primary/40 disabled:opacity-50"
          >
            {e2eeLoading ? 'Kontrol…' : 'Kontrol Et'}
          </button>
        </div>
        {e2eeResult && (
          <div className="mt-3 bg-black/30 rounded-lg p-3 space-y-1 text-[11px]">
            {e2eeResult.note && (
              <p className="text-amber-300">{e2eeResult.note}</p>
            )}
            {e2eeResult.found === true && (
              <>
                <p className="text-white/80">
                  <span className="text-white/40">Kullanıcı:</span> <span className="font-bold">{e2eeResult.display_name}</span>
                  <span className="text-white/40"> · </span>
                  <span className="font-mono text-white/60">{e2eeResult.username}</span>
                </p>
                <p style={{ color: e2eeResult.has_public_key ? '#10B981' : '#EF4444' }}>
                  {e2eeResult.has_public_key ? '✅' : '❌'} Public Key
                  {e2eeResult.has_public_key && <span className="text-white/40"> ({e2eeResult.public_key_len} char base64)</span>}
                  {!e2eeResult.has_public_key && <span className="text-white/40"> — kullanıcı henüz uygulamaya hiç login olmamış</span>}
                </p>
                <p style={{ color: e2eeResult.has_backup ? '#10B981' : '#F59E0B' }}>
                  {e2eeResult.has_backup ? '✅' : '⚠️'} Yol B Backup
                  {e2eeResult.has_backup && <span className="text-white/40"> ({e2eeResult.backup_len} char) + salt: {e2eeResult.has_salt ? 'var' : 'yok'}</span>}
                  {!e2eeResult.has_backup && <span className="text-white/40"> — uninstall/reinstall sonrası mesajlar gelmez</span>}
                </p>
                {(e2eeResult.is_banned || e2eeResult.is_deleted) && (
                  <p className="text-red-400">⚠️ Hesap durumu: {e2eeResult.is_banned && 'BANLI '}{e2eeResult.is_deleted && 'SİLİNMİŞ'}</p>
                )}
              </>
            )}
            {e2eeResult.found === false && (
              <p className="text-red-300">❌ Kullanıcı bulunamadı (UUID hatalı veya yok)</p>
            )}
          </div>
        )}
      </div>

      <h3 className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2 mt-8">Test Push (Bildirim)</h3>
      <div className="bg-card rounded-lg p-3 border border-white/5">
        <p className="text-white/40 text-[11px] mb-2 leading-relaxed">
          Kullanıcı UUID gir → o kullanıcının kayıtlı cihazına test push bildirimi gönderilir.
          Token yoksa "gönderilemedi (token yok)" döner (normal).
        </p>
        <div className="flex gap-2">
          <input
            value={testPushUserId}
            onChange={(e) => setTestPushUserId(e.target.value)}
            placeholder="Kullanıcı UUID"
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/50 font-mono"
          />
          <button
            onClick={sendTestPush}
            disabled={testPushLoading}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-primary/20 border border-primary/40 disabled:opacity-50"
          >
            {testPushLoading ? 'Gönder…' : 'Test Push Gönder'}
          </button>
        </div>
        {testPushResult && (
          <div className="mt-3 bg-black/30 rounded-lg p-3 text-[11px]">
            {testPushResult.sent === true && <p className="text-emerald-400">✅ Push gönderildi.</p>}
            {testPushResult.sent === false && (
              <p className="text-amber-300">⚠️ Gönderilemedi{testPushResult.reason ? ` (${testPushResult.reason})` : ''}.</p>
            )}
            {testPushResult.note && <p className="text-white/60 mt-1">{testPushResult.note}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
