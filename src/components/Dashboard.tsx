import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RolesSection } from '../sections/RolesSection';
import { PhotosSection } from '../sections/PhotosSection';
import { HistorySection } from '../sections/HistorySection';
import { SupportSection } from '../sections/SupportSection';
import { ReportsSection } from '../sections/ReportsSection';
import { SettingsSection } from '../sections/SettingsSection';
import { ApiMonitorSection } from '../sections/ApiMonitorSection';
import { OverviewSection } from '../sections/OverviewSection';
import { BannedSection } from '../sections/BannedSection';
import { BrandMark } from './ui';

// masterOnly: yalnız master görür. Moderatör bu sekmeleri görmez ve
// ilgili RPC'ler sunucuda da moderatöre kapalıdır (çift katman).
export const SECTIONS = [
  { key: 'overview', label: 'Genel Bakış', color: '#60A5FA' },
  { key: 'photos', label: 'Fotoğraf Onayı', color: '#C0A080' },
  { key: 'support', label: 'İstekler', color: '#14B8A6' },
  { key: 'reports', label: 'Şikayetler', color: '#EF4444' },
  { key: 'roles', label: 'Yetkiler & Premium', color: '#C0A080', masterOnly: true },
  { key: 'banned', label: 'Banlılar', color: '#F59E0B' },
  { key: 'history', label: 'Karar Geçmişi', color: '#F59E0B' },
  { key: 'settings', label: 'Ayarlar', color: '#10B981', masterOnly: true },
  { key: 'api', label: 'API İzleme', color: '#A855F7', masterOnly: true },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

export function Dashboard({ email, role }: { email: string; role: string }) {
  // Moderatör master-only sekmeleri görmez.
  const sections = SECTIONS.filter((s) => role === 'master' || !('masterOnly' in s && s.masterOnly));
  const [active, setActive] = useState<SectionKey>('overview');
  const meta = sections.find((s) => s.key === active) ?? sections[0];

  // 5 dakika hareketsiz kalınca otomatik çıkış (açık unutulan oturum riski).
  useEffect(() => {
    const IDLE_MS = 5 * 60_000;
    let timerId: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timerId);
      timerId = setTimeout(() => supabase.auth.signOut(), IDLE_MS);
    };
    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timerId);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-60 bg-card border-b md:border-b-0 md:border-r border-white/10 flex flex-col">
        <div className="p-4 md:p-5 border-b border-white/10 flex items-center justify-between md:block">
          <div>
            <BrandMark size={24} textClass="text-lg" />
            <p className="text-white/40 text-xs mt-1">Yönetim Paneli</p>
          </div>
          {/* Mobilde çıkış butonu üst başlıkta — masaüstünde alt köşede. */}
          <button
            onClick={() => supabase.auth.signOut()}
            className="md:hidden shrink-0 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
          >
            Çıkış
          </button>
        </div>
        <nav className="flex md:flex-col gap-1 p-2 md:p-3 overflow-x-auto">
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`text-left shrink-0 whitespace-nowrap px-4 py-2.5 rounded-lg text-sm transition-colors ${
                active === s.key ? 'bg-white/10 font-bold' : 'text-white/60 hover:bg-white/5'
              }`}
              style={active === s.key ? { color: s.color } : undefined}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="hidden md:block p-3 border-t border-white/10 mt-auto">
          <p className="text-white/30 text-[11px] mb-2 truncate">{email}</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full border border-white/15 rounded-lg py-2 text-xs text-white/70 hover:bg-white/5"
          >
            Çıkış Yap
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-auto">
        <div className="flex items-center justify-between mb-5 gap-4">
          <h2 className="text-xl md:text-2xl font-serif" style={{ color: meta.color }}>
            {meta.label}
          </h2>
          <button
            onClick={() => supabase.auth.signOut()}
            className="hidden md:block shrink-0 border border-white/15 rounded-lg px-4 py-2 text-xs text-white/70 hover:bg-white/5"
          >
            Çıkış Yap
          </button>
        </div>
        {active === 'overview' && (
          <OverviewSection
            onNavigate={(s) => {
              if (sections.some((sec) => sec.key === s)) setActive(s as SectionKey);
            }}
          />
        )}
        {active === 'photos' && <PhotosSection />}
        {active === 'support' && <SupportSection />}
        {active === 'reports' && <ReportsSection />}
        {active === 'roles' && role === 'master' && <RolesSection />}
        {active === 'banned' && <BannedSection />}
        {active === 'history' && <HistorySection />}
        {active === 'settings' && role === 'master' && <SettingsSection />}
        {active === 'api' && role === 'master' && <ApiMonitorSection />}
      </main>
    </div>
  );
}
