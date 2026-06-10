
export function BrandMark({ size = 28, textClass = 'text-xl' }: { size?: number; textClass?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="#C0A080" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter"
        aria-hidden="true"
      >
        <path d="M5 21 8 10" />
        <path d="M8 12 12 16" />
        <polygon points="5,4 11,4 8,8" fill="#C0A080" stroke="none" />
        <path d="M19 21 16 10" />
        <path d="M16 12 12 16" />
        <polygon points="19,4 13,4 16,8" fill="#C0A080" stroke="none" />
        <polygon points="12,15 13,16 12,17 11,16" fill="#C0A080" stroke="none" />
      </svg>
      <span className={`${textClass} text-primary brand-wordmark`}>FREJYA</span>
    </span>
  );
}

export function Loading({ label = 'Yükleniyor…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-white/40 text-sm py-6">
      <span className="w-4 h-4 border-2 border-white/15 border-t-primary rounded-full animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="text-white/35 text-sm py-10 text-center">{text}</p>;
}

export function StatusMessage({ text }: { text: string }) {
  if (!text) return null;
  const isError = /hata|başarısız|bulunamad|geçersiz|yetkisiz|asamaz/i.test(text);
  return (
    <p className={`text-xs mb-4 ${isError ? 'text-red-400' : 'text-emerald-400'}`}>{text}</p>
  );
}
