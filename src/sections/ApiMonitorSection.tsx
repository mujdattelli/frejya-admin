import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading } from '../components/ui';

type ApiKey = {
  key: string; status?: string; usage_count?: number; limit?: number;
  dailyUsage?: number; [k: string]: unknown;
};

const maskKey = (k: string) =>
  !k || k.trim() === '' ? '(boş)' : k.length <= 8 ? k : `${k.slice(0, 5)}…${k.slice(-4)}`;

const StatusBadge = ({ status }: { status?: string }) => {
  if (status === 'dead') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">🔴 Çalışmıyor (403)</span>;
  }
  if (status === 'invalid') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">🔴 Çalışmıyor (400)</span>;
  }
  if (status === 'exhausted') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 shrink-0">🟡 Kota Dolu</span>;
  }
  if (status === 'active') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">🟢 Çalışıyor</span>;
  }
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/50 border border-white/10 shrink-0">⚪ {status || 'Kontrol Edilmedi'}</span>;
};

export function ApiMonitorSection() {
  const [activeTab, setActiveTab] = useState<'agent' | 'photo'>('agent');

  // Ajan & Arama Anahtarları
  const [agentFreeKeys, setAgentFreeKeys] = useState<ApiKey[]>([]);
  const [agentPaidKeys, setAgentPaidKeys] = useState<ApiKey[]>([]);

  // Fotoğraf Anahtarları
  const [photoFreeKeys, setPhotoFreeKeys] = useState<ApiKey[]>([]);
  const [photoPaidKeys, setPhotoPaidKeys] = useState<ApiKey[]>([]);

  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    const fetchKeys = async () => {
      // Her iki satırı da tek sorguda çek
      const { data: rows } = await supabase
        .from('system_settings')
        .select('*')
        .in('id', ['api_keys', 'agent_api_keys']);

      if (!active) return;

      const norm = (x: unknown): ApiKey => (typeof x === 'string' ? { key: x } : (x as ApiKey));

      const photoRow = rows?.find((r) => r.id === 'api_keys');
      const agentRow = rows?.find((r) => r.id === 'agent_api_keys');

      setPhotoFreeKeys(Array.isArray(photoRow?.free_keys) ? photoRow.free_keys.map(norm) : []);
      setPhotoPaidKeys(Array.isArray(photoRow?.paid_keys) ? photoRow.paid_keys.map(norm) : []);

      setAgentFreeKeys(Array.isArray(agentRow?.free_keys) ? agentRow.free_keys.map(norm) : []);
      setAgentPaidKeys(Array.isArray(agentRow?.paid_keys) ? agentRow.paid_keys.map(norm) : []);

      setLastUpdate(new Date());
      setLoading(false);
    };

    fetchKeys();
    const interval = setInterval(fetchKeys, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) return <Loading />;

  const Bar = ({ used, total, color }: { used: number; total: number; color: string }) => (
    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
      <div className="h-full transition-all duration-300" style={{ width: `${Math.min(100, (used / (total || 1)) * 100)}%`, background: color }} />
    </div>
  );

  const currentFree = activeTab === 'agent' ? agentFreeKeys : photoFreeKeys;
  const currentPaid = activeTab === 'agent' ? agentPaidKeys : photoPaidKeys;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white/60 text-xs">
            CANLI · her 5 sn yenilenir{lastUpdate ? ` · son: ${lastUpdate.toLocaleTimeString('tr-TR')}` : ''}
          </span>
        </div>
      </div>

      {/* Havuz Seçim Butonları */}
      <div className="flex gap-2 mb-4 bg-white/5 p-1 rounded-xl border border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab('agent')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'agent' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' : 'text-white/60 hover:text-white'
          }`}
        >
          <span>🧠 Ajan & Arama AI Havuzu</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-black/40 rounded-full">{agentFreeKeys.length + agentPaidKeys.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('photo')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'photo' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' : 'text-white/60 hover:text-white'
          }`}
        >
          <span>📷 Fotoğraf Doğrulama Havuzu</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-black/40 rounded-full">{photoFreeKeys.length + photoPaidKeys.length}</span>
        </button>
      </div>

      {/* Havuz Bilgilendirme Notu */}
      <div className="mb-4 text-xs text-white/50">
        {activeTab === 'agent'
          ? 'Fısıltı, Sohbet Kıvılcımı, Aura Kalemi, Ajan Notu ve 512-d pgvector arama için kullanılan anahtarlar.'
          : 'Profil fotoğrafı gerçek yüz ve biyometrik onay worker’ı için kullanılan anahtarlar.'}
      </div>

      {/* Ücretsiz Havuz Listesi */}
      <h3 className={`text-xs font-bold uppercase tracking-widest mb-2 ${activeTab === 'agent' ? 'text-amber-400' : 'text-emerald-400'}`}>
        {activeTab === 'agent' ? 'Ajan Ücretsiz Havuz (1050 İstek/Gün)' : 'Fotoğraf Ücretsiz Havuz (1050 İstek/Gün)'}
      </h3>
      {currentFree.length === 0 && <p className="text-white/40 text-xs mb-3">Bu havuzda tanımlı anahtar yok.</p>}
      {currentFree.map((k, i) => {
        const used = k.dailyUsage ?? k.usage_count ?? 0;
        const total = k.limit || 1050;
        return (
          <div key={i} className="bg-card rounded-lg p-3 mb-2 border border-white/5 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-primary font-mono text-sm">{maskKey(k.key)}</span>
              <StatusBadge status={k.status} />
            </div>
            <Bar used={used} total={total} color={activeTab === 'agent' ? '#F59E0B' : '#10B981'} />
            <p className="text-white/40 text-[10px] mt-1 text-right">{used} / {total} istek</p>
          </div>
        );
      })}

      {/* Ücretli Havuz Listesi */}
      <h3 className="text-red-400 text-xs font-bold uppercase tracking-widest mb-2 mt-4">
        {activeTab === 'agent' ? 'Ajan Ücretli Havuz (Yedek)' : 'Fotoğraf Ücretli Havuz (Yedek)'}
      </h3>
      {currentPaid.length === 0 && <p className="text-white/40 text-xs">Bu havuzda tanımlı anahtar yok.</p>}
      {currentPaid.map((k, i) => {
        const used = k.dailyUsage ?? k.usage_count ?? 0;
        const total = k.limit || 500;
        return (
          <div key={i} className="bg-card rounded-lg p-3 mb-2 border border-white/5 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-primary font-mono text-sm">{maskKey(k.key)}</span>
              <StatusBadge status={k.status} />
            </div>
            <Bar used={used} total={total} color="#EF4444" />
            <p className="text-white/40 text-[10px] mt-1 text-right">{used} / {total} istek</p>
          </div>
        );
      })}
    </div>
  );
}
