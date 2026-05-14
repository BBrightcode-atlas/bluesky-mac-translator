import { useEffect, useState } from 'react';

interface StatusInfo {
  running: boolean;
  pid?: number;
  port?: number;
  version?: string;
  error?: string;
  code?: string;
}

interface Props {
  endpointIsLocal: boolean;
}

interface NmhResponse {
  type?: 'status' | 'error';
  running?: boolean;
  pid?: number;
  port?: number;
  version?: string;
  message?: string;
  code?: string;
}

export function ServerStatus({ endpointIsLocal }: Props) {
  const [info, setInfo] = useState<StatusInfo>({ running: false });

  useEffect(() => {
    if (!endpointIsLocal) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = (await chrome.runtime.sendMessage({
          kind: 'nmh',
          payload: { type: 'status' },
        })) as NmhResponse;
        if (cancelled) return;
        if (res?.type === 'status') {
          setInfo({
            running: !!res.running,
            pid: res.pid,
            port: res.port,
            version: res.version,
          });
        } else if (res?.type === 'error') {
          setInfo({ running: false, error: res.message, code: res.code });
        }
      } catch (e) {
        if (!cancelled) setInfo({ running: false, error: String(e) });
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [endpointIsLocal]);

  async function restart() {
    await chrome.runtime.sendMessage({ kind: 'nmh', payload: { type: 'restart' } });
  }
  async function shutdown() {
    await chrome.runtime.sendMessage({ kind: 'nmh', payload: { type: 'shutdown' } });
  }

  if (!endpointIsLocal) {
    return (
      <div className="card">
        <h2>Server status</h2>
        <p className="muted">원격 엔드포인트 사용 중 — 로컬 NMH가 관리하지 않습니다.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Server status</h2>
      {info.error ? (
        <p>
          <span className="status-dot bad" />
          {info.code === 'apfel_not_installed' ? (
            <>
              apfel이 설치되지 않았습니다. <span className="code">brew install apfel</span>
            </>
          ) : (
            <>오류: {info.error}</>
          )}
        </p>
      ) : info.running ? (
        <p>
          <span className="status-dot ok" />
          실행 중 {info.pid ? `(PID ${info.pid}, port ${info.port})` : ''}
        </p>
      ) : (
        <p>
          <span className="status-dot bad" />
          중지됨
        </p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" onClick={() => void restart()}>
          재시작
        </button>
        <button type="button" className="ghost" onClick={() => void shutdown()}>
          종료
        </button>
      </div>
    </div>
  );
}
