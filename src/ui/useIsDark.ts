import { useEffect, useState } from 'react';
import { useStore } from '../model/store';

export function useIsDark(): boolean {
  const mode = useStore((s) => s.settings.theme);
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mode === 'dark' || (mode === 'system' && sysDark);
}
