import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import './styles.css';
import { Layout } from './Layout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { RunDetailPage } from './pages/RunDetail';
import { SettingsPage } from './pages/Settings';
import { AnalyticsPage } from './pages/Analytics';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'runs/:id', element: <RunDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
