"use client";

import { useEffect, useRef, useState } from "react";

/** Logo da ADEMP (public/ademp-logo.png). Se o arquivo não existir, mostra um selo com o nome. */
export function Logo({ size = 40 }: { size?: number }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // O erro de carregamento pode acontecer antes da hidratação; confere de novo ao montar.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-lg bg-brand font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.32 }}
        aria-label="ADEMP"
      >
        ADEMP
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src="/ademp-logo.png" alt="ADEMP" style={{ height: size, width: "auto" }} className="object-contain" onError={() => setFailed(true)} />
  );
}

const AVATAR_COLORS = ["#1a73e8", "#e8710a", "#188038", "#d93025", "#9334e6", "#007b83", "#c5221f", "#b06000", "#3c4043", "#185abc"];

/** Avatar circular com a inicial, como no Gmail. A cor é fixa por e-mail. */
export function Avatar({ name, email, size = 32 }: { name?: string | null; email: string; size?: number }) {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const letter = (name || email).trim().charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white select-none"
      style={{ width: size, height: size, fontSize: size * 0.45, background: AVATAR_COLORS[h % AVATAR_COLORS.length] }}
      title={name ? `${name} <${email}>` : email}
    >
      {letter}
    </span>
  );
}
