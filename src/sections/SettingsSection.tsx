import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, StatusMessage } from '../components/ui';

type ApiKey = { key: string; status?: string; usage_count?: number; limit?: number; [k: string]: unknown };

export function SettingsSection() {
  const [freeKeys, setFreeKeys] = useState<ApiKey[]>([]);
  const [paidKeys, setPaidKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const toggleReveal = (id: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: keys } = await supabase.from('system_settings').select('*').eq('id', 'api_keys').single();
    const k = keys as any;
    setFreeKeys(Array.isArray(k?.free_keys) ? k.free_keys.map(normKey) : []);
    setPaidKeys(Array.isArray(k?.paid_keys) ? k.paid_keys.map(normKey) : []);
    setLoading(false);
  };

  const normKey = (k: any): ApiKey =>
    typeof k === 'string' ? { key: k, status: 'active', usage_count: 0, limit: 100 } : k;

  const saveKeys = async () => {
    setSaving(true); setMsg('');
    const { data, error } = await supabase.rpc('rpc_admin_save_api_keys', {
      p_free: freeKeys.filter((k) => k.key.trim() !== ''),
      p_paid: paidKeys.filter((k) => k.key.trim() !== ''),
    });
    setSaving(false);
    if (error) { setMsg('Hata: ' + error.message); return; }
    const d = data as any;
    if (d) {
      setFreeKeys(Array.isArray(d.free_keys) ? d.free_keys.map(normKey) : []);
      setPaidKeys(Array.isArray(d.paid_keys) ? d.paid_keys.map(normKey) : []);
    }
    setMsg('API anahtarları kaydedildi.');
  };

  if (loading) return <Loading />;

  const KeyList = ({ list, setList, color, label, kind }: {
    list: ApiKey[]; setList: (v: ApiKey[]) => void; color: string; label: string; kind: string;
  }) => (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold uppercase text-xs" style={{ color }}>{label}</span>
        <button onClick={() => setList([...list, { key: '', status: 'active', usage_count: 0, limit: 100 }])}
          className="rounded px-2 py-0.5 text-lg leading-none" style={{ background: color + '22', color }}>+</button>
      </div>
      {list.length === 0 && <p className="text-white/40 text-xs italic">Anahtar yok.</p>}
      {list.map((k, i) => {
        const id = `${kind}-${i}`;
        const shown = revealed.has(id);
        return (
          <div key={i} className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-1.5 mb-2 border border-white/10">
            <input
              type={shown ? 'text' : 'password'}
              autoComplete="off"
              value={k.key}
              onChange={(e) => { const n = [...list]; n[i] = { ...n[i], key: e.target.value }; setList(n); }}
              placeholder="API anahtarı"
              className="flex-1 bg-transparent text-primary font-mono text-xs outline-none py-1.5"
            />
            <button onClick={() => toggleReveal(id)} className="text-white/50 text-xs shrink-0">
              {shown ? 'Gizle' : 'Göster'}
            </button>
            <button onClick={() => setList(list.filter((_, x) => x !== i))} className="text-red-400 text-xs shrink-0">Sil</button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="max-w-2xl">
      <StatusMessage text={msg} />

      <div className="bg-card rounded-xl p-5 border-l-4 border-emerald-500 border-y border-r border-white/5 mb-4">
        <h3 className="font-bold mb-4">Dinamik API Anahtarı Yönetimi</h3>
        <KeyList list={freeKeys} setList={setFreeKeys} color="#10B981" label="Ücretsiz Anahtarlar" kind="free" />
        <KeyList list={paidKeys} setList={setPaidKeys} color="#EF4444" label="Ücretli Anahtarlar" kind="paid" />
        <button onClick={saveKeys} disabled={saving}
          className="w-full bg-emerald-500 text-black font-bold rounded-lg py-2.5 text-sm disabled:opacity-50">
          {saving ? 'Kaydediliyor…' : 'Anahtarları Kaydet'}
        </button>
      </div>

    </div>
  );
}
