import { useState } from 'react';

const KEY_STORE = 'interchange.anthropicKey';

export function loadKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
}

export function saveKey(k: string) {
  try {
    if (k) localStorage.setItem(KEY_STORE, k);
    else localStorage.removeItem(KEY_STORE);
  } catch {
    /* storage blocked: the key lives for this tab only */
  }
}

export function CopyButton({ text, label = 'Copy', primary = true }: { text: string; label?: string; primary?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      className={`btn ${primary ? 'btn-primary' : ''}`}
      data-state={state}
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setState('copied');
            setTimeout(() => setState('idle'), 1800);
          })
          .catch(() => setState('failed'))
      }
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy blocked: select the text' : label}
    </button>
  );
}

export function KeyForm({ current, onSave, onCancel }: { current: string; onSave: (k: string) => void; onCancel: () => void }) {
  const [k, setK] = useState(current);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(k.trim());
      }}
    >
      <h2 id="modal-title">Read questions with Claude</h2>
      <p>
        The built-in reader handles plain sentences. With an Anthropic API key, Claude reads looser ones too. One small request per question, sent from this
        browser straight to api.anthropic.com. The key stays in this browser.
      </p>
      <label className="field">
        API key
        <input type="password" value={k} onChange={(e) => setK(e.target.value)} placeholder="sk-ant-..." autoFocus />
      </label>
      <div className="route-actions">
        <button className="btn btn-primary" type="submit">
          {k ? 'Use this key' : 'Use the built-in reader'}
        </button>
        {current && (
          <button className="btn" type="button" onClick={() => onSave('')}>
            Forget key
          </button>
        )}
        <button className="btn-link" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
