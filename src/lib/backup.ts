import { useEffect } from 'react';
import { getData, setSettings } from './store';
import { isMacApp, writeBackup } from './native';

const DAY = 86400000;

/** Writes a backup file now (Mac app only) and remembers when. */
export async function runBackup() {
  const d = getData();
  const res = await writeBackup(JSON.stringify(d, null, 2), d.settings.backupDir);
  if (res.ok) setSettings({ lastBackupAt: Date.now(), backupDir: res.dir });
  return res;
}

/** Once a day, quietly back everything up (checked at launch and every hour). */
export function useAutoBackup() {
  useEffect(() => {
    if (!isMacApp) return;
    const check = () => {
      const s = getData().settings;
      if (s.autoBackup && s.setupDone && Date.now() - s.lastBackupAt > DAY) runBackup();
    };
    const first = setTimeout(check, 5000);
    const id = setInterval(check, 3600000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
}
