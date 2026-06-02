import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Database, Trash2, RefreshCw } from 'lucide-react';

interface Document {
  filename: string;
  path: string;
  chunk_count: number;
  uploaded_at?: string;
  last_updated?: string;
}

interface UploadTabProps {
  apiBaseUrl: string;
  onRefreshDocs: () => void;
  documents: Document[];
  provider: 'gemini' | 'ollama';
  customApiKey: string;
  freeTriesUsed: number;
  token: string | null;
}

export const UploadTab: React.FC<UploadTabProps> = ({ 
  apiBaseUrl, 
  onRefreshDocs, 
  documents,
  provider,
  customApiKey,
  freeTriesUsed,
  token
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReindex = async () => {
    if (provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey) {
      setStatusMessage({ 
        text: "Gemini Free Trial Limit Reached. Please configure your Google AI Studio API Key in the Chat tab first.", 
        type: 'error' 
      });
      return;
    }

    setReindexing(true);
    setStatusMessage({ text: `Re-indexing all documents for ${provider === 'gemini' ? 'Gemini' : 'Ollama'}...`, type: 'info' });

    const headers: Record<string, string> = {};
    if (customApiKey) {
      headers['X-Gemini-API-Key'] = customApiKey;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/documents/reindex?provider=${provider}`, {
        method: 'POST',
        headers: headers
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Re-indexing failed");
      }

      const data = await response.json();
      setStatusMessage({ 
        text: data.message || `Successfully re-indexed documents.`, 
        type: 'success' 
      });
      onRefreshDocs();
    } catch (error: any) {
      console.error(error);
      setStatusMessage({ 
        text: error.message || "An error occurred during re-indexing.", 
        type: 'error' 
      });
    } finally {
      setReindexing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const uploadFile = async (file: File) => {
    // Validate file type
    const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    if (!allowedTypes.includes(file.type)) {
      setStatusMessage({ text: "Only PDF, TXT and MD files are supported.", type: 'error' });
      return;
    }

    if (provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey) {
      setStatusMessage({ 
        text: "Gemini Free Trial Limit Reached. Please configure your Google AI Studio API Key in the Chat tab first.", 
        type: 'error' 
      });
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setStatusMessage({ text: `Uploading ${file.name}...`, type: 'info' });

    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (customApiKey) {
      headers['X-Gemini-API-Key'] = customApiKey;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      // Simulate progress up to 80%
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 80) {
            clearInterval(interval);
            return 80;
          }
          return prev + 10;
        });
      }, 300);

      const response = await fetch(`${apiBaseUrl}/upload?provider=${provider}`, {
        method: 'POST',
        headers: headers,
        body: formData,
      });

      clearInterval(interval);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Upload failed");
      }

      const data = await response.json();
      setUploadProgress(100);
      setStatusMessage({ 
        text: `Successfully ingested "${file.name}"! (${data.chunks} chunks created).`, 
        type: 'success' 
      });
      
      // Refresh documents in parent state
      onRefreshDocs();
      
    } catch (error: any) {
      console.error(error);
      setStatusMessage({ 
        text: error.message || "An error occurred during upload. Check if backend and API keys are set up.", 
        type: 'error' 
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (window.confirm(`Are you sure you want to delete "${filename}"? This will remove all its chunks from the vector database and disk.`)) {
      setStatusMessage({ text: `Deleting "${filename}"...`, type: 'info' });

      const headers: Record<string, string> = {};
      if (customApiKey) {
        headers['X-Gemini-API-Key'] = customApiKey;
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/documents/${encodeURIComponent(filename)}?provider=${provider}`, {
          method: 'DELETE',
          headers: headers
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || "Deletion failed");
        }

        setStatusMessage({
          text: `Successfully deleted "${filename}".`,
          type: 'success'
        });
        onRefreshDocs();
      } catch (error: any) {
        console.error(error);
        setStatusMessage({
          text: error.message || "An error occurred during deletion.",
          type: 'error'
        });
      }
    }
  };

  return (
    <div className="upload-grid fade-in">
      <div className="glass-card" style={{ padding: '32px' }}>
        <h2 className="file-list-title">
          <UploadCloud style={{ color: 'var(--primary)' }} /> Upload New Document
        </h2>
        
        <div 
          className={`dropzone-container ${dragActive ? 'active' : ''}`}
          onDragEnter={provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? undefined : handleDrag}
          onDragLeave={provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? undefined : handleDrag}
          onDragOver={provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? undefined : handleDrag}
          onDrop={provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? undefined : handleDrop}
          onClick={provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? undefined : onButtonClick}
          style={{
            ...(dragActive ? { borderColor: 'var(--primary)', backgroundColor: 'rgba(139, 92, 246, 0.08)' } : {}),
            ...(provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? { opacity: 0.5, cursor: 'not-allowed', borderColor: 'rgba(239, 68, 68, 0.3)' } : {})
          }}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            className="file-input"
            accept=".pdf,.txt,.md"
            disabled={provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey}
          />
          <UploadCloud style={provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? { color: 'var(--danger)' } : {}} />
          <p className="dropzone-text">
            {provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? (
              <span style={{ color: '#fca5a5' }}>
                <strong>Free trials exhausted.</strong> Google AI Studio API Key is required.
              </span>
            ) : (
              <>
                <strong>Drag and drop</strong> your file here, or <span style={{ color: 'var(--primary)', textDecoration: 'underline' }}>browse</span>
              </>
            )}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            {provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? "Configure your API key in the Chat tab or switch to local Ollama." : "Supports PDF, TXT, and MD files"}
          </p>
        </div>

        {statusMessage && (
          <div className={`uploading-status`} style={{ marginTop: '24px' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: '14px',
              fontWeight: 500,
              color: statusMessage.type === 'error' ? 'var(--danger)' : 
                     statusMessage.type === 'success' ? 'var(--accent)' : 'var(--text-primary)'
            }}>
              <span>{statusMessage.text}</span>
              {uploading && <span>{uploadProgress}%</span>}
            </div>
            
            {(uploading || uploadProgress > 0) && (
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="glass-card file-list-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 className="file-list-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database style={{ color: 'var(--secondary)' }} /> Ingested Vault Files ({documents.length})
          </h2>
          {documents.length > 0 && (
            <button 
              onClick={handleReindex}
              disabled={reindexing || uploading || (provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey)}
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', borderRadius: '8px' }}
            >
              <RefreshCw style={{ width: '13px', height: '13px' }} className={reindexing ? 'spin' : ''} />
              {reindexing ? 'Re-indexing...' : `Re-index for ${provider === 'gemini' ? 'Gemini' : 'Ollama'}`}
            </button>
          )}
        </div>

        {documents.length === 0 ? (
          <div className="empty-placeholder">
            <FileText />
            <p>No documents uploaded yet</p>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>Upload a file on the left to start building your knowledge base.</p>
          </div>
        ) : (
          <div className="file-list-items">
            {documents.map((doc, idx) => (
              <div key={idx} className="file-item">
                <div className="file-details">
                  <FileText className="file-icon" />
                  <div>
                    <div className="file-meta-name" title={doc.filename}>{doc.filename}</div>
                    <div className="file-meta-sub">
                      {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : 'Existing document'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="chunk-badge">
                    {doc.chunk_count} Chunks
                  </div>
                  <button 
                    onClick={() => handleDelete(doc.filename)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', height: '28px' }}
                    title="Delete document"
                  >
                    <Trash2 style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
