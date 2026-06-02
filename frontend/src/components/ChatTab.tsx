import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, HelpCircle, BookOpen, Trash2, X } from 'lucide-react';

interface Source {
  filename: string;
  page: number;
  content: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  intent?: string;
}

interface ChatTabProps {
  apiBaseUrl: string;
  provider: 'gemini' | 'ollama';
  setProvider: React.Dispatch<React.SetStateAction<'gemini' | 'ollama'>>;
  customApiKey: string;
  setCustomApiKey: React.Dispatch<React.SetStateAction<string>>;
  freeTriesUsed: number;
  setFreeTriesUsed: React.Dispatch<React.SetStateAction<number>>;
  token: string | null;
}

const PERSONA_MODES = [
  { value: 'default', label: 'Default Assistant', desc: 'Standard informative responses.' },
  { value: 'student', label: 'Study Assistant', desc: 'Uses simple language, lists, and bullet points.' },
  { value: 'lawyer', label: 'Legal Researcher', desc: 'Formal, precise, and highlights ambiguities.' },
  { value: 'developer', label: 'Technical Guide', desc: 'Focuses on implementation and codebase details.' }
];

const QUICK_PROMPTS = [
  "Summarize the document",
  "What is the main topic discussed?",
  "Generate a 5-question quiz for me",
  "Compare the key concepts here"
];

export const ChatTab: React.FC<ChatTabProps> = ({ 
  apiBaseUrl, 
  provider, 
  setProvider, 
  customApiKey, 
  setCustomApiKey, 
  freeTriesUsed, 
  setFreeTriesUsed,
  token
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('default');
  const [sessionId, setSessionId] = useState('session_' + Math.random().toString(36).substr(2, 9));
  const [loading, setLoading] = useState(false);
  const [activeSources, setActiveSources] = useState<Source[]>([]);
  const [activePdf, setActivePdf] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<number>(1);
  const [activeContent, setActiveContent] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [temperature, setTemperature] = useState<number>(0.2);
  const [k, setK] = useState<number>(5);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text) return;

    setInput('');
    setLastQuery(text);
    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (customApiKey) {
      headers['X-Gemini-API-Key'] = customApiKey;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/query`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          question: text,
          mode: mode,
          session_id: sessionId,
          provider: provider,
          temperature: temperature,
          k: k
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          const errData = await response.json();
          throw new Error(errData.detail || "Free trial limit reached. Please configure your API key.");
        }
        throw new Error("Failed to generate response");
      }

      const data = await response.json();
      if (data.free_tries_used !== undefined) {
        setFreeTriesUsed(data.free_tries_used);
      }
      const botMessage: Message = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources || [],
        intent: data.intent
      };

      setMessages(prev => [...prev, botMessage]);
      if (data.sources && data.sources.length > 0) {
        setActiveSources(data.sources);
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage: Message = {
        role: 'assistant',
        content: error.message || "Error connecting to backend or generating response. Make sure the server is active and the Gemini API key is configured.",
        sources: []
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSession = async () => {
    if (window.confirm("Are you sure you want to clear this chat history?")) {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      try {
        await fetch(`${apiBaseUrl}/session/${sessionId}`, {
          method: 'DELETE',
          headers: headers
        });
        setMessages([]);
        setActiveSources([]);
        setActivePdf(null);
        setActivePage(1);
        setActiveContent(null);
        setLastQuery('');
        // Create a new session ID
        setSessionId('session_' + Math.random().toString(36).substr(2, 9));
      } catch (error) {
        console.error(error);
      }
    }
  };

  // Convert raw Markdown text to basic formatted HTML elements
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      let formattedLine = line;

      // Handle bold
      formattedLine = formattedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formattedLine = formattedLine.replace(/\*(.*?)\*/g, '<em>$1</em>');

      // Handle bullet lists
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const content = line.trim().substring(2);
        return <li key={idx} dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />;
      }

      // Handle numbered lists
      const numberedMatch = line.trim().match(/^(\d+)\.\s(.*)/);
      if (numberedMatch) {
        return <li key={idx} value={numberedMatch[1]} dangerouslySetInnerHTML={{ __html: numberedMatch[2].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />;
      }

      // Handle headings
      if (line.startsWith('### ')) {
        return <h4 key={idx} style={{ marginTop: '14px', marginBottom: '8px', color: 'white' }} dangerouslySetInnerHTML={{ __html: line.substring(4) }} />;
      }
      if (line.startsWith('## ')) {
        return <h3 key={idx} style={{ marginTop: '16px', marginBottom: '8px', color: 'white' }} dangerouslySetInnerHTML={{ __html: line.substring(3) }} />;
      }

      return <p key={idx} dangerouslySetInnerHTML={{ __html: formattedLine }} />;
    });
  };

  return (
    <div className="chat-container fade-in">
      <div className="chat-panel glass-card" style={{ padding: '24px' }}>
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="empty-placeholder" style={{ border: 'none', height: '100%' }}>
              <HelpCircle style={{ width: '48px', height: '48px', color: 'var(--primary)', opacity: 0.8 }} />
              <h3 style={{ color: 'white', marginTop: '12px', fontSize: '18px' }}>Ask MindVault anything</h3>
              <p style={{ maxWidth: '380px', marginTop: '6px', fontSize: '14px' }}>
                Ask questions based on your uploaded documents. Choose a persona on the right to adapt the responses.
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%', maxWidth: '480px', marginTop: '32px' }}>
                {QUICK_PROMPTS.map((prompt, idx) => (
                  <button 
                    key={idx} 
                    className="btn btn-secondary" 
                    style={{ fontSize: '12.5px', padding: '12px 14px', textAlign: 'left', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onClick={() => handleSend(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`message-row ${msg.role}`}>
                <div className="message-bubble">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    {msg.role === 'user' ? (
                      <><User style={{ width: '12px', height: '12px' }} /> User</>
                    ) : (
                      <><Bot style={{ width: '12px', height: '12px', color: 'var(--primary)' }} /> Assistant {msg.intent ? `(${msg.intent})` : ''}</>
                    )}
                  </div>
                  <div>
                    {msg.role === 'assistant' ? renderFormattedText(msg.content) : msg.content}
                  </div>
                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {msg.sources.map((source, sIdx) => {
                        if (source.filename === "Conversation History") return null;
                        const isSelected = activePdf === source.filename && activePage === source.page;
                        return (
                          <button
                            key={sIdx}
                            className="btn"
                            style={{ 
                              padding: '4px 10px', 
                              fontSize: '11px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              borderRadius: '6px',
                              cursor: 'pointer',
                              backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.2)' : 'rgba(255,255,255,0.04)',
                              border: isSelected ? '1px solid #7c3aed' : '1px solid rgba(255,255,255,0.1)',
                              color: isSelected ? '#a78bfa' : 'var(--text-secondary)',
                              transition: 'all 0.2s'
                            }}
                            onClick={() => {
                              setActivePdf(source.filename);
                              setActivePage(source.page);
                              setActiveContent(source.content);
                            }}
                          >
                            <BookOpen style={{ width: '12px', height: '12px', color: isSelected ? '#a78bfa' : 'var(--primary)' }} />
                            {source.filename} (p. {source.page})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          
          {loading && (
            <div className="message-row assistant">
              <div className="message-bubble" style={{ color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
                  <Bot style={{ width: '12px', height: '12px', color: 'var(--primary)' }} /> Thinking
                </div>
                <div style={{ display: 'flex', gap: '4px', padding: '4px 0' }}>
                  <span className="dot" style={{ width: '8px', height: '8px', backgroundColor: 'var(--primary)', borderRadius: '50%', animation: 'fadeIn 0.6s infinite alternate' }}></span>
                  <span className="dot" style={{ width: '8px', height: '8px', backgroundColor: 'var(--primary)', borderRadius: '50%', animation: 'fadeIn 0.6s infinite alternate 0.2s' }}></span>
                  <span className="dot" style={{ width: '8px', height: '8px', backgroundColor: 'var(--primary)', borderRadius: '50%', animation: 'fadeIn 0.6s infinite alternate 0.4s' }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey && (
          <div style={{
            margin: '0 24px 12px 24px',
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#fca5a5',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚠️ <strong>Free Trial Limit Reached:</strong> Please enter your Google AI Studio API Key on the right option panel, or switch LLM Provider to local Ollama.</span>
          </div>
        )}

        <div className="chat-input-area" style={provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? { opacity: 0.6 } : {}}>
          <input 
            type="text" 
            placeholder={provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey ? "Free trials exhausted. Enter your Google AI Studio API Key on the right or switch to Ollama." : "Ask something about your vault files..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !(provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey) && handleSend(input)}
            className="chat-input"
            disabled={loading || (provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey)}
          />
          <button 
            onClick={() => handleSend(input)} 
            className="btn btn-primary" 
            style={{ borderRadius: '10px', width: '40px', height: '40px', padding: 0 }}
            disabled={loading || !input.trim() || (provider === 'gemini' && freeTriesUsed >= 3 && !customApiKey)}
          >
            <Send style={{ width: '18px', height: '18px' }} />
          </button>
        </div>
      </div>

      {!activePdf && (
        <div className="chat-options-panel">
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span className="options-group-title" style={{ margin: 0 }}>Options</span>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', gap: '6px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                onClick={handleClearSession}
                disabled={messages.length === 0}
              >
                <Trash2 style={{ width: '14px', height: '14px' }} /> Clear Session
              </button>
            </div>
            
            <div>
              <label className="options-group-title" style={{ display: 'block', marginBottom: '6px' }}>Persona Mode</label>
              <select 
                value={mode} 
                onChange={(e) => setMode(e.target.value)} 
                className="select-control"
              >
                {PERSONA_MODES.map((p, idx) => (
                  <option key={idx} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                {PERSONA_MODES.find(p => p.value === mode)?.desc}
              </p>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="options-group-title" style={{ margin: 0 }}>LLM Provider</label>
                {provider === 'gemini' && (
                  <span 
                    className="chunk-badge" 
                    style={{ 
                      fontSize: '10px', 
                      padding: '2px 6px',
                      backgroundColor: customApiKey ? 'rgba(16, 185, 129, 0.15)' : freeTriesUsed >= 3 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      color: customApiKey ? '#34d399' : freeTriesUsed >= 3 ? '#fca5a5' : '#93c5fd',
                      border: customApiKey ? '1px solid rgba(16, 185, 129, 0.2)' : freeTriesUsed >= 3 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(59, 130, 246, 0.2)'
                    }}
                  >
                    {customApiKey ? 'Using Custom Key' : `${Math.max(0, 3 - freeTriesUsed)} trials left`}
                  </span>
                )}
              </div>
              <select 
                value={provider} 
                onChange={(e) => setProvider(e.target.value as 'gemini' | 'ollama')} 
                className="select-control"
              >
                <option value="gemini">Google Gemini (Cloud)</option>
                <option value="ollama">Ollama Llama 3.2 (Local)</option>
              </select>

              {provider === 'gemini' && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="options-group-title" style={{ fontSize: '11px', margin: 0 }}>Google AI Studio Key</label>
                    <a 
                      href="https://aistudio.google.com/" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ fontSize: '10px', color: 'var(--primary)', textDecoration: 'underline' }}
                    >
                      Get key
                    </a>
                  </div>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input 
                      type={showApiKey ? "text" : "password"} 
                      placeholder="Paste your AI Studio API key here..."
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      className="select-control"
                      style={{ 
                        paddingRight: '36px', 
                        fontSize: '12px',
                        border: freeTriesUsed >= 3 && !customApiKey ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.1)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px'
                      }}
                      title={showApiKey ? "Hide Key" : "Show Key"}
                    >
                      {showApiKey ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      )}
                    </button>
                  </div>
                  {freeTriesUsed >= 3 && !customApiKey && (
                    <p style={{ fontSize: '11px', color: '#fca5a5', marginTop: '6px', margin: '6px 0 0 0' }}>
                      ⚠️ Free trials finished. API key required to query Gemini.
                    </p>
                  )}
                </div>
              )}
              {provider === 'ollama' && (
                <div style={{ marginTop: '10px', fontSize: '12.2px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <p style={{ margin: 0 }}>⚙️ Running Ollama fully locally.</p>
                  <p style={{ margin: 0, fontSize: '11px' }}>Ensure Ollama service is active with models <code>llama3.2:3b</code> and <code>nomic-embed-text</code> pulled.</p>
                </div>
              )}
            </div>

            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="options-group-title" style={{ margin: 0 }}>Temperature</label>
                <span className="chunk-badge" style={{ fontSize: '11px', padding: '2px 6px' }}>{temperature}</span>
              </div>
              <input 
                type="range" 
                min="0.0" 
                max="1.0" 
                step="0.1" 
                value={temperature} 
                onChange={(e) => setTemperature(parseFloat(e.target.value))} 
                style={{ width: '100%', accentColor: 'var(--primary)', marginTop: '8px', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="options-group-title" style={{ margin: 0 }}>Retrieve Count (K)</label>
                <span className="chunk-badge" style={{ fontSize: '11px', padding: '2px 6px' }}>{k} chunks</span>
              </div>
              <input 
                type="range" 
                min="3" 
                max="10" 
                step="1" 
                value={k} 
                onChange={(e) => setK(parseInt(e.target.value))} 
                style={{ width: '100%', accentColor: 'var(--primary)', marginTop: '8px', cursor: 'pointer' }}
              />
            </div>
          </div>

          <div className="glass-card" style={{ padding: '20px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <span className="options-group-title">Source Attributions</span>
            
            {activeSources.length === 0 ? (
              <div className="empty-placeholder" style={{ flexGrow: 1, border: 'none', padding: '20px 0' }}>
                <BookOpen style={{ color: 'var(--text-muted)' }} />
                <p style={{ fontSize: '13px' }}>Sources will appear here after a RAG query</p>
              </div>
            ) : (
              <div className="source-cards-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: 'calc(100vh - 420px)' }}>
                {activeSources.map((source, idx) => {
                  if (source.filename === "Conversation History") return null;
                  const isSelected = activePdf === source.filename && activePage === source.page;
                  return (
                    <div 
                      key={idx} 
                      className={`source-card clickable ${isSelected ? 'active' : ''}`}
                      style={{ 
                        cursor: 'pointer', 
                        padding: '12px',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        border: isSelected ? '1px solid #7c3aed' : '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => {
                        setActivePdf(source.filename);
                        setActivePage(source.page);
                        setActiveContent(source.content);
                      }}
                    >
                      <div className="source-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: isSelected ? '#a78bfa' : 'white', fontWeight: 600 }}>
                        <BookOpen style={{ width: '14px', height: '14px' }} /> {source.filename}
                      </div>
                      <div className="source-card-detail" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Page Reference: {source.page}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activePdf && (
        <div className="glass-card fade-in" style={{ width: '42%', minWidth: '420px', display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Document Viewer</span>
              <h3 style={{ color: 'white', fontSize: '15px', fontWeight: 600, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activePdf}>
                {activePdf}
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="chunk-badge" style={{ fontSize: '11px' }}>Page {activePage}</span>
              <button 
                onClick={() => {
                  setActivePdf(null);
                  setActivePage(1);
                  setActiveContent(null);
                }} 
                className="btn btn-secondary" 
                style={{ padding: '6px', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                title="Close viewer"
              >
                <X style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
          </div>

          {/* Iframe for PDF rendering */}
          <div style={{ flexGrow: 1, backgroundColor: '#1e1e1e', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', height: '400px' }}>
            <iframe
              src={`${apiBaseUrl}/documents/${activePdf}/file?token=${token}#page=${activePage}`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="PDF Viewer"
            />
          </div>

          {/* Citation text highlighting card */}
          {activeContent && (
            <div className="glass-card" style={{ padding: '16px', marginTop: '16px', backgroundColor: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Cited Passage Snippet</span>
              <div 
                style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', maxHeight: '120px', overflowY: 'auto', paddingRight: '4px' }}
                dangerouslySetInnerHTML={{ __html: highlightText(activeContent, lastQuery) }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const highlightText = (text: string, query: string) => {
  if (!query || !text) return text;
  // Clean query and extract terms longer than 3 characters
  const terms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  if (terms.length === 0) return text;
  
  try {
    const pattern = new RegExp(`\\b(${terms.map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})\\b`, 'gi');
    return text.replace(pattern, '<mark style="background-color: rgba(234, 179, 8, 0.4); color: white; padding: 2px 4px; border-radius: 4px;">$1</mark>');
  } catch (e) {
    return text;
  }
};
