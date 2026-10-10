import { useState, type FormEvent } from 'react';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

type Props = {
  client: SupabaseClient | null;
  session: Session | null;
  configurationError: string | null;
  onClose: () => void;
};

export default function SupabaseAccountDialog({ client, session, configurationError, onClose }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client) {
      setError(configurationError || 'Supabase is not configured.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'signup') {
        const { data, error: authError } = await client.auth.signUp({ email: email.trim(), password });
        if (authError) throw authError;
        if (!data.session) {
          setMessage('Account created. Check your email to confirm the account, then sign in.');
          setMode('login');
        } else {
          setMessage('Account created and signed in.');
          setPassword('');
        }
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        setPassword('');
        onClose();
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (!client) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: authError } = await client.auth.signOut();
      if (authError) throw authError;
      onClose();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop account-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="dialog account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
        <div className="account-dialog__heading">
          <span><UserRound size={17} /></span>
          <div>
            <h2 id="account-dialog-title">Cutline account</h2>
            <p>Cloud projects are private to your account. Media files stay on this device.</p>
          </div>
        </div>
        {!client && <p className="account-dialog__message is-error" role="alert">
          {configurationError || 'Supabase is not configured. Add the Vite Supabase values to the editor .env file.'}
        </p>}
        {error && <p className="account-dialog__message is-error" role="alert">{error}</p>}
        {message && <p className="account-dialog__message" role="status">{message}</p>}
        {session ? (
          <div className="account-dialog__signed-in">
            <span>Signed in as</span>
            <strong>{session.user.email || 'Supabase user'}</strong>
            <button type="button" className="btn" onClick={() => void signOut()} disabled={busy}>
              <LogOut size={14} />{busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        ) : (
          <>
            <div className="account-dialog__tabs" role="tablist" aria-label="Account action">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-selected' : ''} onClick={() => { setMode('login'); setError(''); setMessage(''); }}>Log in</button>
              <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'is-selected' : ''} onClick={() => { setMode('signup'); setError(''); setMessage(''); }}>Create account</button>
            </div>
            <form className="account-dialog__form" onSubmit={(event) => void submit(event)}>
              <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} disabled={busy} /></label>
              <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(event) => setPassword(event.currentTarget.value)} disabled={busy} /></label>
              <button type="submit" className="btn primary" disabled={busy || !client}>
                <LogIn size={14} />{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
              </button>
            </form>
          </>
        )}
        <div className="dialog-actions"><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </section>
    </div>
  );
}
