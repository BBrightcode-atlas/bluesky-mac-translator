import { DEFAULT_SETTINGS } from '@/lib/storage';
import { useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function EndpointEditor({ value, onChange }: Props) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="field">
      <label htmlFor="endpoint">apfel 엔드포인트</label>
      <div className="row">
        <input
          id="endpoint"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onChange(draft)}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setDraft(DEFAULT_SETTINGS.apfelEndpoint);
            onChange(DEFAULT_SETTINGS.apfelEndpoint);
          }}
        >
          기본값으로
        </button>
      </div>
    </div>
  );
}
