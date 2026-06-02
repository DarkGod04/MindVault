import { useState, useEffect } from 'react';
import { MessageSquare, UploadCloud, LayoutDashboard, Database, RefreshCw, LogOut, ShieldAlert } from 'lucide-react';
import { ChatTab } from './components/ChatTab';
import { UploadTab } from './components/UploadTab';
import { DashboardTab } from './components/DashboardTab';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

interface Document {
  filename: string;
  path: string;
  chunk_count: number;
  uploaded_at?: string;
  last_updated?: string;
}

declare global {
  interface Window {
    google?: any;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'upload' | 'dashboard'>('chat');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [provider, setProvider] = useState<'gemini' | 'ollama'>(() => {
    return (localStorage.getItem('mindvault_provider') as 'gemini' | 'ollama') || 'gemini';
  });
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem('mindvault_gemini_api_key') || '';
  });
  const [freeTriesUsed, setFreeTriesUsed] = useState<number>(0);

  // Authentication State
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('mindvault_auth_token');
  });
  const [user, setUser] = useState<{ id: number; username: string } | null>(() => {
    const storedUser = localStorage.getItem('mindvault_user');
    return storedUser ? JSON.parse(storedUser) : null;
  });

  // Login/Registration form state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [googleSdkLoaded, setGoogleSdkLoaded] = useState(false);

  // Load Google Identity Services SDK dynamically
  useEffect(() => {
    if (window.google) {
      setGoogleSdkLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setGoogleSdkLoaded(true);
    };
    script.onerror = () => {
      console.error("Failed to load Google Identity Services SDK script.");
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // Initialize Google Sign-in button
  useEffect(() => {
    if (!token && googleSdkLoaded && window.google) {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (clientId) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleLoginSuccess,
          });
          const buttonElement = document.getElementById("google-signin-button");
          if (buttonElement) {
            window.google.accounts.id.renderButton(
              buttonElement,
              { theme: "outline", size: "large", width: 360 }
            );
          }
        } catch (err) {
          console.error("Google sign-in initialization failed", err);
        }
      }
    }
  }, [token, authMode, googleSdkLoaded]);

  const handleGoogleLoginSuccess = async (response: any) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/login/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Google authentication failed.");
      }
      const data = await res.json();
      setToken(data.access_token);
      const loggedUser = { id: data.id, username: data.username };
      setUser(loggedUser);
      localStorage.setItem('mindvault_auth_token', data.access_token);
      localStorage.setItem('mindvault_user', JSON.stringify(loggedUser));
    } catch (err: any) {
      setAuthError(err.message || "Failed to log in with Google.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('mindvault_provider', provider);
  }, [provider]);

  useEffect(() => {
    localStorage.setItem('mindvault_gemini_api_key', customApiKey);
  }, [customApiKey]);

  // Auth Header helper
  const getHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // Check backend server status
  const checkStatus = async () => {
    setCheckingStatus(true);
    try {
      const res = await fetch(API_BASE_URL + '/');
      if (res.ok) {
        setIsOnline(true);
      } else {
        setIsOnline(false);
      }
    } catch (err) {
      setIsOnline(false);
    } finally {
      setCheckingStatus(false);
    }
  };

  // Fetch all documents from registry database
  const fetchDocuments = async () => {
    if (!token) return;
    try {
      const res = await fetch(API_BASE_URL + '/documents', {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
    }
  };

  // Fetch usage stats
  const fetchUsage = async () => {
    if (!token) return;
    try {
      const res = await fetch(API_BASE_URL + '/usage', {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setFreeTriesUsed(data.free_tries_used || 0);
      }
    } catch (err) {
      console.error("Error fetching usage statistics:", err);
    }
  };

  useEffect(() => {
    checkStatus();
    if (token) {
      fetchDocuments();
      fetchUsage();
    }
    
    // Poll status every 15 seconds
    const interval = setInterval(() => {
      checkStatus();
      if (token) {
        fetchUsage();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [token]);

  // Handle local registration/login
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setAuthLoading(true);

    const username = usernameInput.trim();
    const password = passwordInput.trim();

    if (!username || !password) {
      setAuthError("Username and password are required.");
      setAuthLoading(false);
      return;
    }

    try {
      if (authMode === 'register') {
        const res = await fetch(`${API_BASE_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "Registration failed.");
        }
        setAuthSuccess("Successfully registered! Please log in now.");
        setAuthMode('login');
        setPasswordInput('');
      } else {
        const res = await fetch(`${API_BASE_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "Invalid username or password.");
        }
        const data = await res.json();
        setToken(data.access_token);
        const loggedUser = { id: data.id, username: data.username };
        setUser(loggedUser);
        localStorage.setItem('mindvault_auth_token', data.access_token);
        localStorage.setItem('mindvault_user', JSON.stringify(loggedUser));
        setUsernameInput('');
        setPasswordInput('');
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication request failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('mindvault_auth_token');
    localStorage.removeItem('mindvault_user');
    setDocuments([]);
  };

  // Auth Screen Layout if not logged in
  if (!token) {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    return (
      <div className="auth-container">
        <div className="glass-card auth-card fade-in">
          <div className="auth-header">
            <div className="logo-icon">M</div>
            <h1 className="auth-title">MindVault</h1>
            <p className="auth-subtitle">
              {authMode === 'login' ? 'Log in to access your personal vault' : 'Create an account to start building your vault'}
            </p>
          </div>

          {authError && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', fontSize: '13px' }}>
              ❌ {authError}
            </div>
          )}

          {authSuccess && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#34d399', fontSize: '13px' }}>
              ✓ {authSuccess}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label">Username</label>
              <input 
                type="text" 
                placeholder="Enter your username" 
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="form-input"
                disabled={authLoading}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Password</label>
              <input 
                type="password" 
                placeholder="Enter your password" 
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="form-input"
                disabled={authLoading}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '12px', marginTop: '8px' }}
              disabled={authLoading}
            >
              {authLoading ? 'Verifying...' : authMode === 'login' ? 'Access Vault' : 'Create Account'}
            </button>
          </form>

          {/* Google Sign-in Partition */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '12px', margin: '8px 0' }}>
            <span style={{ flexGrow: 1, height: '1px', backgroundColor: 'var(--glass-border)' }}></span>
            <span>OR OAuth Sign-In</span>
            <span style={{ flexGrow: 1, height: '1px', backgroundColor: 'var(--glass-border)' }}></span>
          </div>

          <div className="google-auth-btn-container">
            {googleClientId ? (
              <div id="google-signin-button"></div>
            ) : (
              <div style={{ 
                padding: '12px', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(245, 158, 11, 0.08)', 
                border: '1px solid rgba(245, 158, 11, 0.2)', 
                color: '#fcd34d', 
                fontSize: '12px', 
                display: 'flex', 
                gap: '8px',
                alignItems: 'center',
                textAlign: 'left'
              }}>
                <ShieldAlert style={{ width: '20px', height: '20px', color: '#f59e0b', flexShrink: 0 }} />
                <span>Google Sign-in not configured. Define <code>VITE_GOOGLE_CLIENT_ID</code> in your env.</span>
              </div>
            )}
          </div>

          <div className="auth-toggle">
            {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}
            <button 
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setAuthError(null);
                setAuthSuccess(null);
              }}
              className="auth-toggle-link"
            >
              {authMode === 'login' ? 'Sign Up' : 'Log In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          <div className="brand-section">
            <div className="logo-icon">M</div>
            <h1 className="brand-name">MindVault</h1>
          </div>
          
          <nav className="nav-links">
            <button 
              className={`nav-btn ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <MessageSquare />
              Chat Assistant
            </button>
            <button 
              className={`nav-btn ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <UploadCloud />
              Upload Document
            </button>
            <button 
              className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard />
              System Dashboard
            </button>
          </nav>
        </div>

        <div>
          {/* Authenticated User info */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            padding: '12px', 
            backgroundColor: 'rgba(255,255,255,0.02)', 
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
            marginBottom: '12px',
            fontSize: '13px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <div style={{ 
                width: '24px', 
                height: '24px', 
                borderRadius: '50%', 
                backgroundColor: 'var(--primary)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '11px',
                fontWeight: 700,
                color: 'white',
                flexShrink: 0
              }}>
                {user?.username?.substring(0, 2).toUpperCase()}
              </div>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={user?.username}>
                {user?.username}
              </span>
            </div>
            <button 
              onClick={handleLogout}
              style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
              title="Logout user"
            >
              <LogOut style={{ width: '15px', height: '15px' }} />
            </button>
          </div>

          {/* Server Status Indicator */}
          <div className="status-section">
            <div className="status-indicator">
              <span className={`status-dot ${isOnline ? 'online' : 'offline'}`}></span>
              <span style={{ flexGrow: 1 }}>
                Backend: {isOnline ? 'Online' : 'Offline'}
              </span>
              <button 
                onClick={checkStatus} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Refresh status"
                disabled={checkingStatus}
              >
                <RefreshCw style={{ width: '12px', height: '12px' }} className={checkingStatus ? 'spin' : ''} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="header-bar">
          <h2 className="header-title">
            {activeTab === 'chat' && 'RAG Chat Room'}
            {activeTab === 'upload' && 'Document Vault Ingestion'}
            {activeTab === 'dashboard' && 'Control Dashboard'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <Database style={{ width: '16px', height: '16px', color: 'var(--secondary)' }} />
            <span>Vault Status: {documents.length} Files</span>
          </div>
        </header>

        <div className="tab-content">
          {activeTab === 'chat' && (
            <ChatTab 
              apiBaseUrl={API_BASE_URL} 
              provider={provider}
              setProvider={setProvider}
              customApiKey={customApiKey}
              setCustomApiKey={setCustomApiKey}
              freeTriesUsed={freeTriesUsed}
              setFreeTriesUsed={setFreeTriesUsed}
              token={token}
            />
          )}
          {activeTab === 'upload' && (
            <UploadTab 
              apiBaseUrl={API_BASE_URL} 
              onRefreshDocs={fetchDocuments}
              documents={documents}
              provider={provider}
              customApiKey={customApiKey}
              freeTriesUsed={freeTriesUsed}
              token={token}
            />
          )}
          {activeTab === 'dashboard' && (
            <DashboardTab 
              apiBaseUrl={API_BASE_URL} 
              documents={documents}
              isOnline={isOnline}
              token={token}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
