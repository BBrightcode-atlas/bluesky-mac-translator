import { isLocalEndpoint } from '@/lib/storage';

interface Props {
  value: boolean;
  endpoint: string;
  onChange: (v: boolean) => void;
}

export function AutoRestartToggle({ value, endpoint, onChange }: Props) {
  const local = isLocalEndpoint(endpoint);
  return (
    <div className="field">
      <label>
        <input
          type="checkbox"
          checked={value && local}
          disabled={!local}
          onChange={(e) => onChange(e.target.checked)}
        />{' '}
        apfel 서버가 죽으면 자동으로 다시 시작
      </label>
      {!local && <span className="muted">원격 엔드포인트에서는 적용되지 않습니다.</span>}
    </div>
  );
}
