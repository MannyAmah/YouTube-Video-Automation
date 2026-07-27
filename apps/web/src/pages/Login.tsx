import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-8 w-80 shadow-sm">
        <h1 className="text-lg font-semibold text-teal-800 mb-1">MedExplained</h1>
        <p className="text-xs text-slate-500 mb-6">Operations sign-in</p>
        <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
          required
        />
        <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
          required
        />
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <button
          disabled={busy}
          className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
