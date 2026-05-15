import { useEffect, useState } from 'react';
import { diagnose } from '@/lib/nmh-client';

interface Diag {
  claudePath: string | null;
  version: string | null;
  loggedIn: boolean;
}

export function ClaudeStatus() {
  const [state, setState] = useState<'loading' | { kind: 'ok'; diag: Diag } | { kind: 'err'; message: string }>(
    'loading',
  );

  function refresh() {
    setState('loading');
    void diagnose().then((r) => {
      if (r.type === 'diagnose_result') {
        setState({ kind: 'ok', diag: { claudePath: r.claudePath, version: r.version, loggedIn: r.loggedIn } });
      } else {
        setState({ kind: 'err', message: r.message });
      }
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="card">
      <h2>🤖 Claude CLI</h2>
      {state === 'loading' ? (
        <p>진단 중...</p>
      ) : state.kind === 'err' ? (
        <p>
          진단 실패: {state.message}{' '}
          <button type="button" onClick={refresh}>
            다시
          </button>
        </p>
      ) : (
        <>
          <p>
            경로: <span className="code">{state.diag.claudePath ?? '(없음)'}</span>
          </p>
          <p>
            버전: <span className="code">{state.diag.version ?? '(미확인)'}</span>
          </p>
          {!state.diag.claudePath && (
            <p className="muted">
              설치: <span className="code">npm i -g @anthropic-ai/claude-code</span>
            </p>
          )}
          <button type="button" onClick={refresh}>
            다시 진단
          </button>
        </>
      )}
    </div>
  );
}
