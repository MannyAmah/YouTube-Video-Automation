import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { api } from './api';

export function Layout() {
  const [email, setEmail] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .me()
      .then((me) => setEmail(me.email))
      .catch(() => navigate('/login'));
  }, [navigate]);

  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium ${
      isActive ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-200'
    }`;

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <span className="font-semibold text-teal-800">MedExplained Ops</span>
          <nav className="flex gap-1 flex-1">
            <NavLink to="/" end className={link}>
              Pipeline
            </NavLink>
            <NavLink to="/analytics" className={link}>
              Analytics
            </NavLink>
            <NavLink to="/settings" className={link}>
              Settings
            </NavLink>
          </nav>
          <span className="text-xs text-slate-500">{email}</span>
          <button
            className="text-xs text-slate-500 hover:text-slate-800"
            onClick={() => api.logout().then(() => navigate('/login'))}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
