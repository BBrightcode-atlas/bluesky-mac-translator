import { type Settings, isLocalEndpoint, loadSettings, saveSettings } from '@/lib/storage';
import { useEffect, useState } from 'react';
import { AutoRestartToggle } from './components/AutoRestartToggle';
import { EndpointEditor } from './components/EndpointEditor';
import { LanguageSelector } from './components/LanguageSelector';
import { ServerStatus } from './components/ServerStatus';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  async function patch(p: Partial<Settings>) {
    if (!settings) return;
    setSettings({ ...settings, ...p });
    await saveSettings(p);
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
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={settings.showLanguagePicker}
              onChange={(e) => void patch({ showLanguagePicker: e.target.checked })}
            />{' '}
            게시물 옆에 ▾ 드롭다운 표시
          </label>
        </div>
        <EndpointEditor
          value={settings.apfelEndpoint}
          onChange={(v) => void patch({ apfelEndpoint: v })}
        />
        <AutoRestartToggle
          value={settings.autoRestartServer}
          endpoint={settings.apfelEndpoint}
          onChange={(v) => void patch({ autoRestartServer: v })}
        />
      </div>

      <ServerStatus endpointIsLocal={isLocalEndpoint(settings.apfelEndpoint)} />

      <p className="muted">
        ※ apfel이 미설치면 터미널에서 <span className="code">brew install apfel</span> 실행 후 이
        페이지를 새로고침하세요.
      </p>
    </div>
  );
}
