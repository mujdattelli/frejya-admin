import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, StatusMessage } from '../components/ui';

// 7 Haz 2026: KOTALAR — tüm limitler config-driven (app_quotas tablosu). Buradan
// değiştirilince RPC'ler/trigger'lar quota_val() ile otomatik yeni değeri okur.
// -1 = SINIRSIZ. Artırmak güvenli; azaltmak da güvenli (takip: mevcut korunur/grandfather,
// günlükler: ertesi gün) — TEK İSTİSNA: Post tavanı (FIFO) azaltınca eski postlar silinir.
type TierVals = { normal: number; verified: number; premium: number };
type QuotaConfig = Record<string, TierVals>;

const CATS: { key: string; label: string; hint?: string }[] = [
  { key: 'search_result',  label: 'Arama sonucu (günde görülebilecek distinct kişi)' },
  { key: 'search_refresh', label: 'Arama yenileme (günlük hak)', hint: '-1 = sınırsız' },
  { key: 'follow_total',   label: 'Takip toplam (liste büyüklüğü)', hint: '-1 = sınırsız' },
  { key: 'daily_like',     label: 'Günlük beğeni' },
  { key: 'daily_comment',  label: 'Günlük yorum' },
  { key: 'daily_match',    label: 'Günlük match' },
  { key: 'post_fifo',      label: 'Post tavanı (FIFO)', hint: '⚠️ azaltınca eski postlar silinir' },
  { key: 'doorbell_daily', label: 'Zil (günlük)' },
];
const TIERS: (keyof TierVals)[] = ['normal', 'verified', 'premium'];
const TIER_LABEL: Record<string, string> = { normal: 'Normal', verified: 'Doğrulanmış', premium: 'Premium' };

export function QuotasSection() {
  const [cfg, setCfg] = useState<QuotaConfig | null>(null);
  const [orig, setOrig] = useState<QuotaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('app_quotas').select('config').eq('id', 'global').single();
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    const c = (data?.config as QuotaConfig) || {};
    setCfg(JSON.parse(JSON.stringify(c)));
    setOrig(JSON.parse(JSON.stringify(c)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const setVal = (cat: string, tier: keyof TierVals, v: string) => {
    const n = v === '' || v === '-' ? v : parseInt(v, 10);
    setCfg((prev) => prev ? { ...prev, [cat]: { ...prev[cat], [tier]: (n as any) } } : prev);
  };

  const save = async () => {
    if (!cfg || !orig) return;
    // Post FIFO azaltma uyarısı (veri silinir)
    const fifoDown = TIERS.some((t) => Number(cfg.post_fifo?.[t]) < Number(orig.post_fifo?.[t]));
    if (fifoDown && !window.confirm('Post tavanı (FIFO) DÜŞÜRÜLÜYOR. Bu, limiti aşan kullanıcıların EN ESKİ postlarını bir sonraki post atışında KALICI siler. Devam edilsin mi?')) return;
    // boş/geçersiz kontrol
    for (const c of CATS) for (const t of TIERS) {
      const v = Number((cfg[c.key] as any)?.[t]);
      if (!Number.isFinite(v)) { setMsg(`Geçersiz değer: ${c.label} / ${TIER_LABEL[t]}`); return; }
    }
    setBusy(true); setMsg('');
    const { error } = await supabase.from('app_quotas')
      .update({ config: cfg, updated_at: new Date().toISOString() }).eq('id', 'global');
    setBusy(false);
    if (error) { setMsg('Kaydetme hatası: ' + error.message); return; }
    setOrig(JSON.parse(JSON.stringify(cfg)));
    setMsg('Kotalar kaydedildi. Sistem yeni değerleri anında kullanır.');
  };

  if (loading) return <Loading />;
  if (!cfg) return <StatusMessage text={msg || 'Config yok.'} />;

  const dirty = JSON.stringify(cfg) !== JSON.stringify(orig);

  return (
    <div className="max-w-2xl">
      <p className="text-white/50 text-xs mb-4">
        Tüm limitler buradan değişir; sistem (RPC/trigger) anında yeni değeri okur. <b>-1 = sınırsız.</b>
      </p>
      <StatusMessage text={msg} />
      <div className="flex flex-col gap-3">
        {CATS.map((c) => (
          <div key={c.key} className="bg-card rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-3">
              <span className="text-teal-400 font-bold text-[12px]">{c.label}</span>
              {c.hint && <span className="text-amber-400/80 text-[10px]">{c.hint}</span>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {TIERS.map((t) => (
                <label key={t} className="flex flex-col gap-1">
                  <span className="text-white/40 text-[10px]">{TIER_LABEL[t]}</span>
                  <input
                    type="number"
                    value={String((cfg[c.key] as any)?.[t] ?? '')}
                    onChange={(e) => setVal(c.key, t, e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-teal-500/50"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        {dirty && (
          <button onClick={() => setCfg(JSON.parse(JSON.stringify(orig)))}
            className="px-4 py-2 rounded-lg border border-white/20 text-xs">Geri al</button>
        )}
        <button onClick={save} disabled={busy || !dirty}
          className="px-5 py-2 rounded-lg bg-teal-500 text-black font-bold text-xs disabled:opacity-40">
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}
