import { type Settings, loadSettings, saveSettings } from '@/lib/storage';
import { useEffect, useState } from 'react';
import { ClaudeStatus } from './components/ClaudeStatus';
import { LanguageSelector } from './components/LanguageSelector';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  async function patch(p: Partial<Settings>) {
    if (!settings) return;
    const prev = settings;
    const next = { ...settings, ...p };
    setSettings(next);
    try {
      await saveSettings(p);
    } catch (e) {
      console.error('[bsky-translator] settings 저장 실패', e);
      setSettings(prev);
    }
  }

  if (!settings) return <div className="container">불러오는 중...</div>;

  return (
    <div className="container">
      <h1>Bluesky Translator</h1>

      <div className="card">
        <h2>⚙ Settings</h2>
        <LanguageSelector
          value={settings.targetLang}
          onChange={(v) => void patch({ targetLang: v })}
        />
      </div>

      <ClaudeStatus />

      <p className="muted">
        ※ claude CLI는 한 번 <span className="code">claude login</span> 으로 인증해 두면 됩니다.
      </p>
    </div>
  );
}
