import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Ayarlar — dinamik AI API anahtarları (ücretsiz/ücretli) + global kotalar.
type ApiKey = { key: string; status?: string; usage_count?: number; limit?: number; [k: string]: unknown };

export function SettingsSection() {
  const [freeKeys, setFreeKeys] = useState<ApiKey[]>([]);
  const [paidKeys, setPaidKeys] = useState<ApiKey[]>([]);
  const [limits, setLimits] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: keys } = await supabase.from('system_settings').select('*').eq('id', 'api_keys').single();
    const { data: lim } = await supabase.from('system_settings').select('*').eq('id', 'api_keys_global_limits').single();
    const k = keys as any;
    setFreeKeys(Array.isArray(k?.free_keys) ? k.free_keys.map(normKey) : []);
    setPaidKeys(Array.isArray(k?.paid_keys) ? k.paid_keys.map(normKey) : []);
    setLimits((lim as any) || {});
    setLoading(false);
  };

  const normKey = (k: any): ApiKey =>
    typeof k === 'string' ? { key: k, status: 'active', usage_count: 0, limit: 100 } : k;

  const saveKeys = async () => {
    setSaving(true); setMsg('');
    const { error } = await supabase.from('system_settings').upsert({
      id: 'api_keys',
      free_keys: freeKeys.filter((k) => k.key.trim() !== ''),
      paid_keys: paidKeys.filter((k) => k.key.trim() !== ''),
    });
    setSaving(false);
    setMsg(error ? 'Hata: ' + error.message : 'API anahtarları kaydedildi.');
  };

  const saveLimits = async () => {
    setSaving(true); setMsg('');
    const { error } = await supabase.from('system_settings').upsert({
      id: 'api_keys_global_limits',
      ...limits,
      scrape_status: 'manual_override',
    });
    setSaving(false);
    setMsg(error ? 'Hata: ' + error.message : 'Kotalar kaydedildi.');
  };

  if (loading) return <p className="text-white/40 text-sm">Yükleniyor…</p>;

  const KeyList = ({ list, setList, color, label }: {
    list: ApiKey[]; setList: (v: ApiKey[]) => void; color: string; label: string;
  }) => (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold uppercase text-xs" style={{ color }}>{label}</span>
        <button onClick={() => setList([...list, { key: '', status: 'active', usage_count: 0, limit: 100 }])}
          className="rounded px-2 py-0.5 text-lg leading-none" style={{ background: color + '22', color }}>+</button>
      </div>
      {list.length === 0 && <p className="text-white/40 text-xs italic">Anahtar yok.</p>}
      {list.map((k, i) => (
        <div key={i} className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-1.5 mb-2 border border-white/10">
          <input
            value={k.key}
            onChange={(e) => { const n = [...list]; n[i] = { ...n[i], key: e.target.value }; setList(n); }}
            placeholder="API anahtarı"
            className="flex-1 bg-transparent text-primary font-mono text-xs outline-none py-1.5"
          />
          <button onClick={() => setList(list.filter((_, x) => x !== i))} className="text-red-400 text-xs">Sil</button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-2xl">
      {msg && <p className="text-white/50 text-xs mb-4">{msg}</p>}

      <div className="bg-card rounded-xl p-5 border-l-4 border-emerald-500 border-y border-r border-white/5 mb-4">
        <h3 className="font-bold mb-4">Dinamik API Anahtarı Yönetimi</h3>
        <KeyList list={freeKeys} setList={setFreeKeys} color="#10B981" label="Ücretsiz Anahtarlar" />
        <KeyList list={paidKeys} setList={setPaidKeys} color="#EF4444" label="Ücretli Anahtarlar" />
        <button onClick={saveKeys} disabled={saving}
          className="w-full bg-emerald-500 text-black font-bold rounded-lg py-2.5 text-sm disabled:opacity-50">
          {saving ? 'Kaydediliyor…' : 'Anahtarları Kaydet'}
        </button>
      </div>

      <div className="bg-card rounded-xl p-5 border border-white/5">
        <h3 className="font-bold mb-4">Global Kotalar</h3>
        {[
          ['gemini_safe_daily_limit', 'Güvenli Günlük Limit'],
          ['gemini_safe_monthly_limit', 'Güvenli Aylık Limit'],
          ['max_likes_per_day', 'Günlük Beğeni Limiti'],
          ['max_comments_per_day', 'Günlük Yorum Limiti'],
        ].map(([key, label]) => (
          <div key={key} className="flex justify-between items-center mb-3">
            <span className="text-white/70 text-xs">{label}</span>
            <input
              type="number"
              value={limits[key] ?? ''}
              onChange={(e) => setLimits({ ...limits, [key]: parseInt(e.target.value) || 0 })}
              className="bg-black/50 border border-white/20 rounded px-2 py-1 w-28 text-right text-xs outline-none"
            />
          </div>
        ))}
        <button onClick={saveLimits} disabled={saving}
          className="w-full mt-2 bg-blue-500/20 border border-blue-500/40 text-blue-400 font-bold rounded-lg py-2.5 text-sm disabled:opacity-50">
          {saving ? 'Kaydediliyor…' : 'Kotaları Kaydet'}
        </button>
      </div>
    </div>
  );
}
