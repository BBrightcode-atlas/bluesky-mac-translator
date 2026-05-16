export type TargetLang = 'ko' | 'ja' | 'zh';
// Compose-side target languages for buffer (user writes in their own language,
// translates outward to publish). Kept narrow to avoid bloating the dropdown.
export type ComposeTargetLang = 'en' | 'ja' | 'zh' | 'ko';

export interface Settings {
  targetLang: TargetLang;
  bufferTargetLang: ComposeTargetLang;
}

export const DEFAULT_SETTINGS: Settings = {
  targetLang: 'ko',
  bufferTargetLang: 'en',
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored } as Settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

export function onSettingsChange(handler: (s: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ) => {
    if (area !== 'sync') return;
    if (Object.keys(changes).some((k) => k in DEFAULT_SETTINGS)) {
      void loadSettings().then(handler);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
