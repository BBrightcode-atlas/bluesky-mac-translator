import { COMPOSE_LANG_OPTIONS, LANG_OPTIONS } from '@/lib/prompts';
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
          id="post-lang"
          label="번역 대상 언어 (Bluesky 게시물 읽기)"
          options={LANG_OPTIONS}
          value={settings.targetLang}
          onChange={(v) => void patch({ targetLang: v })}
        />
        <LanguageSelector
          id="buffer-lang"
          label="Buffer 작성 번역 언어"
          options={COMPOSE_LANG_OPTIONS}
          value={settings.bufferTargetLang}
          onChange={(v) => void patch({ bufferTargetLang: v })}
        />
      </div>

      <ClaudeStatus />

      <p className="muted">
        ※ claude CLI는 한 번 <span className="code">claude login</span> 으로 인증해 두면 됩니다.
      </p>
    </div>
  );
}
