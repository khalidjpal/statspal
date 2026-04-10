import { useEffect, useState } from 'react';

export default function StatInput({ value, onChange, label, error, size = 'md' }) {
  const [text, setText] = useState(value > 0 ? String(value) : '');

  useEffect(() => {
    setText(value > 0 ? String(value) : '');
  }, [value]);

  function parseNum(s) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function handleChange(e) {
    const raw = e.target.value;
    const v = raw.replace(/[^0-9]/g, '');
    setText(v);
    onChange(parseNum(v));
  }

  function inc() {
    const next = parseNum(text) + 1;
    setText(String(next));
    onChange(next);
  }

  function dec() {
    const next = Math.max(0, parseNum(text) - 1);
    setText(next > 0 ? String(next) : '');
    onChange(next);
  }

  function clear() {
    setText('');
    onChange(0);
  }

  return (
    <div className={`stat-in stat-in-${size}${error ? ' stat-in-err' : ''}`}>
      <div className="stat-in-label">{label}</div>
      <div className="stat-in-row">
        <button
          type="button"
          className="stat-in-btn stat-in-minus"
          onClick={dec}
          tabIndex={-1}
          aria-label={`Decrease ${label}`}
        >−</button>
        <div className="stat-in-field">
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min="0"
            step="1"
            value={text}
            onChange={handleChange}
            placeholder="0"
            className="stat-in-input"
            aria-label={label}
            aria-invalid={error ? 'true' : undefined}
          />
          {text !== '' && (
            <button
              type="button"
              className="stat-in-clear"
              onClick={clear}
              tabIndex={-1}
              aria-label={`Clear ${label}`}
            >×</button>
          )}
        </div>
        <button
          type="button"
          className="stat-in-btn stat-in-plus"
          onClick={inc}
          tabIndex={-1}
          aria-label={`Increase ${label}`}
        >+</button>
      </div>
      {error && <div className="stat-in-err-msg">{error}</div>}
    </div>
  );
}
