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
  const [showPassword, setShowPassword] = useState(false);

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
        <div className={`md-field${usernameInvalid ? ' md-field--error' : ''}`}>
          <label className="md-field__label" htmlFor={USERNAME_INPUT_ID}>Username</label>
          <div className="md-field__control">
            <input
              id={USERNAME_INPUT_ID}
              className="md-field__input"
              type="text"
              value={username}
              onChange={edit(setUsername)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={usernameInvalid || undefined}
              aria-describedby={usernameInvalid ? 'login-error' : undefined}
            />
          </div>
        </div>

        <div className={`md-field${passwordInvalid ? ' md-field--error' : ''}`}>
          <label className="md-field__label" htmlFor="login-password">Password</label>
          <div className="md-field__control">
            <input
              id="login-password"
              className="md-field__input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={edit(setPassword)}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={passwordInvalid || undefined}
              aria-describedby={passwordInvalid ? 'login-error' : undefined}
            />
            <button
              type="button"
              className="md-field__trailing"
              aria-controls="login-password"
              onClick={() => setShowPassword(v => !v)}
            >
              {showPassword ? 'Hide' : 'Show'}
              <span className="lp-visually-hidden"> password</span>
            </button>
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
