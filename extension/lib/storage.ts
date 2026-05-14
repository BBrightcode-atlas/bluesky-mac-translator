export type TargetLang = 'ko' | 'ja' | 'zh';

export interface Settings {
  targetLang: TargetLang;
  apfelEndpoint: string;
  showLanguagePicker: boolean;
  autoRestartServer: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  targetLang: 'ko',
  apfelEndpoint: 'http://127.0.0.1:11434',
  showLanguagePicker: true,
  autoRestartServer: true,
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

export function isLocalEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}
