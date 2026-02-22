import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Sun, Moon, LayoutDashboard, Key, Users, Settings, Plus, Copy } from 'lucide-react';

const API_BASE = "http://localhost:3456";

function ThemeToggle() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      style={{
        padding: '8px',
        borderRadius: '50%',
        backgroundColor: 'var(--yc-color-fill)',
        color: 'var(--yc-color-text)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
}

function Sidebar() {
  const location = useLocation();
  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'API Keys', path: '/keys', icon: <Key size={20} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
  ];

  return (
    <aside style={{
      width: '250px',
      borderRight: '1px solid var(--yc-color-border-secondary)',
      backgroundColor: 'var(--yc-color-bg-container)',
      display: 'flex',
      flexDirection: 'column',
      padding: 'var(--yc-space-4) 0'
    }}>
      <div style={{ padding: '0 var(--yc-space-6)', marginBottom: 'var(--yc-space-8)' }}>
        <h1 style={{ fontSize: 'var(--yc-font-size-xl)', fontWeight: 'bold', color: 'var(--yc-color-primary)' }}>
          Yoxperience
        </h1>
        <div style={{ fontSize: 'var(--yc-font-size-sm)', color: 'var(--yc-color-text-secondary)' }}>
          SaaS Dashboard
        </div>
      </div>
      
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--yc-space-1)', padding: '0 var(--yc-space-2)' }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--yc-space-3)',
                padding: 'var(--yc-space-3) var(--yc-space-6)',
                textDecoration: 'none',
                color: isActive ? 'var(--yc-color-primary)' : 'var(--yc-color-text-secondary)',
                backgroundColor: isActive ? 'var(--yc-color-primary-bg)' : 'transparent',
                fontWeight: isActive ? 'bold' : 'normal',
                borderRight: isActive ? '3px solid var(--yc-color-primary)' : '3px solid transparent'
              }}
            >
              {item.icon}
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function DashboardPage() {
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    // Usually we would fetch orgId from user context. Using static seeded org for now.
    fetch(`${API_BASE}/api/admin/organizations/org_p7Ge_e5eFf/projects`, {
      headers: { 'Authorization': 'Basic YWRtaW46c2VjcmV0' }
    })
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) setProjects(data);
      })
      .catch(console.error);
  }, []);

  return (
    <div style={{ padding: 'var(--yc-space-8)' }}>
      <h2 style={{ fontSize: 'var(--yc-font-size-2xl)', fontWeight: 'bold', marginBottom: 'var(--yc-space-6)' }}>Projects</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--yc-space-6)' }}>
        {projects.map(p => (
          <div key={p.id} style={{ 
            padding: 'var(--yc-space-6)', 
            backgroundColor: 'var(--yc-color-bg-container)', 
            borderRadius: 'var(--yc-radius-lg)', 
            border: '1px solid var(--yc-color-border-secondary)'
          }}>
            <h3 style={{ fontSize: 'var(--yc-font-size-lg)', fontWeight: 'bold', marginBottom: 'var(--yc-space-2)' }}>{p.name}</h3>
            <p style={{ color: 'var(--yc-color-text-secondary)', fontSize: 'var(--yc-font-size-sm)' }}>ID: {p.id}</p>
          </div>
        ))}

        <div style={{ 
            padding: 'var(--yc-space-6)', 
            backgroundColor: 'var(--yc-color-fill-tertiary)', 
            borderRadius: 'var(--yc-radius-lg)', 
            border: '1px dashed var(--yc-color-border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--yc-color-text-secondary)'
          }}>
            <Plus size={24} style={{ marginBottom: '8px' }} />
            <span>Create Project</span>
        </div>
      </div>
    </div>
  );
}

function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const projectId = 'prj_N0W4K_TOSo'; // Hardcoded for demo seeded project

  const fetchKeys = () => {
    fetch(`${API_BASE}/api/admin/projects/${projectId}/keys`, {
      headers: { 'Authorization': 'Basic YWRtaW46c2VjcmV0' }
    })
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) setKeys(data);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const createKey = () => {
    fetch(`${API_BASE}/api/admin/projects/${projectId}/keys`, {
      method: 'POST',
      headers: { 
        'Authorization': 'Basic YWRtaW46c2VjcmV0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'New API Key' })
    })
    .then(() => fetchKeys());
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    alert('Key copied to clipboard!');
  };

  return (
    <div style={{ padding: 'var(--yc-space-8)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--yc-space-6)' }}>
        <h2 style={{ fontSize: 'var(--yc-font-size-2xl)', fontWeight: 'bold' }}>API Keys</h2>
        <button 
          onClick={createKey}
          style={{
            padding: 'var(--yc-space-2) var(--yc-space-4)',
            backgroundColor: 'var(--yc-color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--yc-radius-md)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Plus size={16} /> Generate Key
        </button>
      </div>
      
      <div style={{ 
        backgroundColor: 'var(--yc-color-bg-container)', 
        borderRadius: 'var(--yc-radius-lg)', 
        border: '1px solid var(--yc-color-border-secondary)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--yc-color-fill-tertiary)', borderBottom: '1px solid var(--yc-color-border-secondary)' }}>
              <th style={{ padding: 'var(--yc-space-3) var(--yc-space-6)', fontWeight: 'bold' }}>Name</th>
              <th style={{ padding: 'var(--yc-space-3) var(--yc-space-6)', fontWeight: 'bold' }}>Key</th>
              <th style={{ padding: 'var(--yc-space-3) var(--yc-space-6)', fontWeight: 'bold' }}>Created</th>
              <th style={{ padding: 'var(--yc-space-3) var(--yc-space-6)', fontWeight: 'bold' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {keys.map(k => (
              <tr key={k.key} style={{ borderBottom: '1px solid var(--yc-color-border-secondary)' }}>
                <td style={{ padding: 'var(--yc-space-4) var(--yc-space-6)' }}>{k.name}</td>
                <td style={{ padding: 'var(--yc-space-4) var(--yc-space-6)', fontFamily: 'monospace' }}>
                  {k.key.substring(0, 12)}...
                </td>
                <td style={{ padding: 'var(--yc-space-4) var(--yc-space-6)', color: 'var(--yc-color-text-secondary)' }}>
                  {new Date(k.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: 'var(--yc-space-4) var(--yc-space-6)' }}>
                  <button 
                    onClick={() => copyKey(k.key)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--yc-color-text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <Copy size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function App() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: 'var(--yc-font-sans)',
      color: 'var(--yc-color-text)',
      backgroundColor: 'var(--yc-color-bg-layout)',
    }}>
      <Sidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          height: '64px',
          padding: '0 var(--yc-space-8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          borderBottom: '1px solid var(--yc-color-border-secondary)',
          backgroundColor: 'var(--yc-color-bg-container)'
        }}>
          <ThemeToggle />
        </header>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/keys" element={<ApiKeysPage />} />
            <Route path="/settings" element={<div style={{ padding: 'var(--yc-space-8)' }}>Settings (Coming Soon)</div>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
