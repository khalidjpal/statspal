import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

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

function ErrorIcon() {
  return (
    <svg className="lp-signin__error-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" />
    </svg>
  );
}

export const USERNAME_INPUT_ID = 'login-username';

export default function SignInCard({ id }) {
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
    <section id={id} className="lp-signin" aria-labelledby="lp-signin-title">
      <h2 id="lp-signin-title" className="lp-signin__title">Sign in</h2>
      <p className="lp-signin__subtitle">Use the login your coach or admin gave you.</p>

      <form className="lp-signin__form" onSubmit={handleSubmit} noValidate aria-busy={loading}>
        <div className={`md-text-field${usernameInvalid ? ' md-text-field--error' : ''}`}>
          <div className="md-text-field__control">
            <input
              id={USERNAME_INPUT_ID}
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
            <label className="md-text-field__label" htmlFor={USERNAME_INPUT_ID}>Username</label>
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

        <div className="lp-signin__error-slot">
          {message && (
            <p id="login-error" className="lp-signin__error" role="alert">
              <ErrorIcon />
              <span>{message}</span>
            </p>
          )}
        </div>

        <button
          type="submit"
          className="md-button md-button--filled lp-signin__submit"
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

      <p className="lp-signin__help">Need an account? Ask your coach or club admin.</p>
    </section>
  );
}
