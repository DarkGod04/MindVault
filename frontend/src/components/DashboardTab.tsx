import React, { useState } from 'react';
import { ShieldCheck, HardDrive, RefreshCw, Layers, Cpu } from 'lucide-react';

interface Document {
  filename: string;
  chunk_count: number;
}

interface DashboardTabProps {
  apiBaseUrl: string;
  documents: Document[];
  isOnline: boolean;
  token: string | null;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ apiBaseUrl, documents, isOnline, token }) => {
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const totalChunks = documents.reduce((sum, doc) => sum + doc.chunk_count, 0);

  const clearAllSessions = async () => {
    if (window.confirm("Are you sure you want to delete session database? This will clear all histories on the backend.")) {
      setClearing(true);
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      try {
        const response = await fetch(`${apiBaseUrl}/session/default_session`, {
          method: 'DELETE',
          headers: headers
        });
        if (response.ok) {
          setMessage("Successfully cleared default session history.");
        } else {
          setMessage("Failed to clear sessions.");
        }
      } catch (err) {
        console.error(err);
        setMessage("Error connecting to backend.");
      } finally {
        setClearing(false);
        setTimeout(() => setMessage(null), 5000);
      }
    }
  };

  return (
    <div className="dashboard-grid fade-in">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div className="stats-card-group">
          <div className="glass-card stat-card">
            <div className="stat-header">
              <span>Total Documents Ingested</span>
              <HardDrive style={{ width: '18px', height: '18px', color: 'var(--secondary)' }} />
            </div>
            <div className="stat-val">{documents.length}</div>
          </div>
          
          <div className="glass-card stat-card">
            <div className="stat-header">
              <span>Total Text Chunks</span>
              <Layers style={{ width: '18px', height: '18px', color: 'var(--primary)' }} />
            </div>
            <div className="stat-val">{totalChunks}</div>
          </div>
        </div>

        <div className="glass-card actions-card">
          <h3 className="file-list-title" style={{ fontSize: '16px', marginBottom: '16px' }}>
            <Cpu style={{ color: 'var(--primary)' }} /> System Administration
          </h3>
          
          <div className="action-row">
            <div>
              <div className="action-details-title">API Server Gateway</div>
              <div className="action-details-desc">Endpoint host address: <code>{apiBaseUrl}</code></div>
            </div>
            <span className={`chunk-badge`} style={{ 
              backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: isOnline ? 'var(--accent)' : 'var(--danger)',
              borderColor: isOnline ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
            }}>
              {isOnline ? 'Online / Operational' : 'Offline / Error'}
            </span>
          </div>

          <div className="action-row">
            <div>
              <div className="action-details-title">Clear Memory</div>
              <div className="action-details-desc">Delete session registries from server memory.</div>
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
              onClick={clearAllSessions}
              disabled={clearing}
            >
              <RefreshCw style={{ width: '14px', height: '14px', marginRight: '4px' }} className={clearing ? 'spin' : ''} /> Wipe Sessions
            </button>
          </div>

          {message && (
            <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', fontSize: '13px', textAlign: 'center' }}>
              {message}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="glass-card" style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <h3 className="file-list-title" style={{ fontSize: '16px', marginBottom: '16px' }}>
            <ShieldCheck style={{ color: 'var(--accent)' }} /> Security & System Logs
          </h3>
          
          <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '20px', flexGrow: 1, fontFamily: 'monospace', fontSize: '12px', border: '1px solid var(--glass-border)' }}>
            <div style={{ color: 'var(--accent)', marginBottom: '8px' }}>[INFO] 2026-05-31: System Boot Sequence Successful.</div>
            <div style={{ color: 'var(--secondary)', marginBottom: '8px' }}>[INFO] FAISS Local DB loaded from vectorstore_gemini.</div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>[INFO] Connected to Gemini Endpoint via text-embedding-004 fallback.</div>
            <div style={{ color: 'var(--text-muted)' }}>[DEBUG] CORS Policy mappings applied for origin http://localhost:3000.</div>
          </div>
          
          <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
            <a 
              href={`${apiBaseUrl}/docs`} 
              target="_blank" 
              rel="noreferrer" 
              className="btn btn-secondary" 
              style={{ width: '100%', textDecoration: 'none' }}
            >
              Open API Interactive Docs
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
