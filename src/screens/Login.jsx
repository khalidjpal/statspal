import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

// Friendlier wording for the messages AuthContext and this form produce.
function friendlyError(error, { usernameMissing, passwordMissing }) {
  if (error === 'Please enter username and password') {
    if (usernameMissing && passwordMissing) return 'Enter your username and password to sign in.';
    if (usernameMissing) return 'Enter your username to sign in.';
    if (passwordMissing) return 'Enter your password to sign in.';
  }
  if (error === 'Invalid username or password') {
    return "That username and password don't match. Check for typos and try again.";
  }
  if (error === 'Login failed') {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  return error;
}

function VolleyballMark() {
  // Three curved seams turning around the centre, each with a parallel
  // panel line, read as a volleyball at any size.
  const seam = (
    <>
      <path d="M24 24c-6.5-3-9.5-9.6-8.2-18.7" />
      <path d="M31.4 20.2c-3.4-5.2-4-10.8-1.6-15.3" />
    </>
  );
  return (
    <svg className="md-login__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle className="md-login__mark-ball" cx="24" cy="24" r="21" />
      <g className="md-login__mark-seams">
        {seam}
        <g transform="rotate(120 24 24)">{seam}</g>
        <g transform="rotate(240 24 24)">{seam}</g>
      </g>
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="md-login__error-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" />
    </svg>
  );
}

export default function Login() {
  const { login, loading, error, setError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password');
      return;
    }
    await login(username.trim(), password.trim());
  }

  const usernameMissing = !username.trim();
  const passwordMissing = !password.trim();
  const missingFields = error === 'Please enter username and password';
  const usernameInvalid = !!error && (!missingFields || usernameMissing);
  const passwordInvalid = !!error && (!missingFields || passwordMissing);
  const message = error ? friendlyError(error, { usernameMissing, passwordMissing }) : '';

  // Clear a stale error as soon as the user starts correcting it.
  const edit = setter => e => {
    setter(e.target.value);
    if (error) setError('');
  };

  return (
    <div className="md-login md-scope">
      <div className="md-login__shapes" aria-hidden="true">
        <span className="md-login__shape md-login__shape--1" />
        <span className="md-login__shape md-login__shape--2" />
        <span className="md-login__shape md-login__shape--3" />
      </div>

      <main className="md-login__card">
        <header className="md-login__brand">
          <div className="md-login__lockup">
            <VolleyballMark />
            <h1 className="md-login__wordmark">
              Volleyball<span className="md-login__wordmark-pal">Pal</span>
            </h1>
          </div>
          <p className="md-login__subtitle">Stats and rotations for your team</p>
        </header>

        <form className="md-login__form" onSubmit={handleSubmit} noValidate aria-busy={loading}>
          <div className={`md-text-field${usernameInvalid ? ' md-text-field--error' : ''}`}>
            <div className="md-text-field__control">
              <input
                id="login-username"
                className="md-text-field__input"
                type="text"
                value={username}
                onChange={edit(setUsername)}
                placeholder=" "
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={usernameInvalid || undefined}
                aria-describedby={usernameInvalid ? 'login-error' : undefined}
              />
              <label className="md-text-field__label" htmlFor="login-username">Username</label>
            </div>
          </div>

          <div className={`md-text-field${passwordInvalid ? ' md-text-field--error' : ''}`}>
            <div className="md-text-field__control">
              <input
                id="login-password"
                className="md-text-field__input"
                type="password"
                value={password}
                onChange={edit(setPassword)}
                placeholder=" "
                autoComplete="current-password"
                aria-invalid={passwordInvalid || undefined}
                aria-describedby={passwordInvalid ? 'login-error' : undefined}
              />
              <label className="md-text-field__label" htmlFor="login-password">Password</label>
            </div>
          </div>

          <div className="md-login__error-slot">
            {message && (
              <p id="login-error" className="md-login__error" role="alert">
                <ErrorIcon />
                <span>{message}</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            className="md-button md-button--filled md-login__submit"
            disabled={loading}
            data-loading={loading || undefined}
          >
            {loading && (
              <svg className="md-spinner" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="9" />
              </svg>
            )}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
