"use client";

import { useEffect, useRef } from "react";

interface Props {
  haloId: string;
}

// Per V1_PLAN A13: notes live in localStorage in v1, migrate to Supabase in v2.
// Single user, single device. The textarea is uncontrolled — localStorage IS the
// store, no React state in between.
export default function HaloNotes({ haloId }: Props) {
  const storageKey = `atlas:notes:${haloId}`;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Prime the textarea from localStorage on mount and whenever the key changes
  // (defensive — in practice the panel route remounts on navigation).
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    try {
      node.value = window.localStorage.getItem(storageKey) ?? "";
    } catch {
      // localStorage can throw in private-browsing mode; leave empty.
      node.value = "";
    }
  }, [storageKey]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      window.localStorage.setItem(storageKey, e.target.value);
    } catch {
      // ignore — same private-mode case
    }
  };

  return (
    <section className="rounded-lg border border-[#3F2570]/60 bg-[#13062A] p-5 lg:sticky lg:top-6">
      <h2 className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-[0.2em] text-[#A878B0]">
        Notes
        <span className="text-[10px] normal-case tracking-normal text-[#5A4878]">
          localStorage · this device only
        </span>
      </h2>
      <textarea
        ref={textareaRef}
        onChange={handleChange}
        placeholder="Markdown notes for this halo. Local to this browser until v2."
        rows={14}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-[#3F2570]/60 bg-[#0A0214] p-3 font-mono text-sm leading-relaxed text-[#E8D6F4] outline-none placeholder:text-[#3F2570] focus:border-[#9B6BC4]"
      />
    </section>
  );
}
