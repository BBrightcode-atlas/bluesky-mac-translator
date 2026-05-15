import { LANG_OPTIONS } from '@/lib/prompts';
import type { TargetLang } from '@/lib/storage';

interface Props {
  value: TargetLang;
  onChange: (v: TargetLang) => void;
}

export function LanguageSelector({ value, onChange }: Props) {
  return (
    <div className="field">
      <label htmlFor="lang">번역 대상 언어</label>
      <select id="lang" value={value} onChange={(e) => onChange(e.target.value as TargetLang)}>
        {LANG_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
