'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('flowcap-theme') as 'dark' | 'light' | null;
    const initial = stored ?? 'dark';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function applyTheme(t: 'dark' | 'light') {
    const html = document.documentElement;
    if (t === 'light') {
      html.classList.remove('dark');
      html.classList.add('light');
    } else {
      html.classList.remove('light');
      html.classList.add('dark');
    }
  }

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    localStorage.setItem('flowcap-theme', next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="w-8 h-8 rounded-md bg-surface border border-[var(--border)] flex items-center justify-center hover:border-[var(--border-hover)] transition-colors"
    >
      {theme === 'dark' ? (
        <Sun className="w-3.5 h-3.5 text-zinc-400" />
      ) : (
        <Moon className="w-3.5 h-3.5 text-zinc-500" />
      )}
    </button>
  );
}

export default ThemeToggle;
