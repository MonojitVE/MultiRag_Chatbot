import { useState, useRef, useEffect, useCallback } from 'react';
import { sendQuery } from './services/api';
import './index.css';

/* ── SVG Icons (no external deps) ────────────────────────────────── */
const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconBot = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
    <circle cx="9" cy="14" r="1" fill="currentColor" /><circle cx="15" cy="14" r="1" fill="currentColor" />
  </svg>
);

const IconUser = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

const IconFile = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
  </svg>
);

const IconClock = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconBrain = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2a3.5 3.5 0 0 0-3.4 4.35A3.5 3.5 0 0 0 4 9.5a3.5 3.5 0 0 0 1.1 2.56A3 3 0 0 0 4 14.5a3 3 0 0 0 1.7 2.71A2.5 2.5 0 0 0 8 20h1.5a1 1 0 0 0 1-1v-7.07" />
    <path d="M14.5 2a3.5 3.5 0 0 1 3.4 4.35A3.5 3.5 0 0 1 20 9.5a3.5 3.5 0 0 1-1.1 2.56A3 3 0 0 1 20 14.5a3 3 0 0 1-1.7 2.71A2.5 2.5 0 0 1 16 20h-1.5a1 1 0 0 1-1-1v-7.07" />
    <path d="M12 2v6.5" />
  </svg>
);

/* ── Helpers ─────────────────────────────────────────────────────── */
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  html = html.replace(/((?:<li>.*?<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.split(/\n\n+/).map(p => {
    p = p.trim();
    if (!p || p.startsWith('<ul>') || p.startsWith('<li>')) return p;
    return `<p>${p}</p>`;
  }).join('');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

const SUGGESTIONS = [
  'Summarize the uploaded documents',
  'What are the key technical skills mentioned?',
  'Describe the profile summary',
];

/* ── Source Item ──────────────────────────────────────────────────── */
function SourceItem({ source }) {
  return (
    <div className="source-item">
      <span className="source-icon"><IconFile /></span>
      <span className="source-name" title={source.filename}>{source.filename}</span>
      <span className="source-page">p.{source.page_number}</span>
      {source.score != null && (
        <span className="source-score">{(source.score * 100).toFixed(1)}%</span>
      )}
    </div>
  );
}

/* ── Sources Dropdown ────────────────────────────────────────────── */
function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="sources-panel">
      <button
        className={`sources-toggle ${open ? 'open' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <IconFile /> {sources.length} source{sources.length > 1 ? 's' : ''}
        <span className="arrow">▾</span>
      </button>
      {open && (
        <div className="sources-list">
          {sources.map((s, i) => <SourceItem key={i} source={s} />)}
        </div>
      )}
    </div>
  );
}

/* ── Chat Message ────────────────────────────────────────────────── */
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const isError = msg.error;

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        {isUser ? <IconUser /> : <IconBot />}
      </div>
      <div className="message-content">
        <div
          className={`message-bubble ${isError ? 'error-bubble' : ''}`}
          dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.text) }}
        />
        {!isUser && msg.sources && <SourcesPanel sources={msg.sources} />}
        {!isUser && msg.executionTime && (
          <div className="exec-time">
            <IconClock /> {msg.executionTime.toFixed(2)}s
          </div>
        )}
        <span className="message-time">{formatTime(msg.time)}</span>
      </div>
    </div>
  );
}

/* ── Typing Indicator ────────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="typing-indicator">
      <div className="message-avatar" style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--hairline-strong)',
        color: 'var(--ink)',
        width: 28, height: 28, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconBot />
      </div>
      <div className="typing-bubble">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
    </div>
  );
}

/* ── Main App ────────────────────────────────────────────────────── */
export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  useEffect(() => {
    fetch('/api/config')
      .then(r => { if (r.ok) setOnline(true); else setOnline(false); })
      .catch(() => setOnline(false));
  }, []);

  const handleSend = useCallback(async (text) => {
    const query = (text || input).trim();
    if (!query || loading) return;

    const userMsg = { role: 'user', text: query, time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const data = await sendQuery(query);
      const botMsg = {
        role: 'assistant',
        text: data.answer,
        sources: data.sources,
        executionTime: data.execution_time_sec,
        time: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      const errorMsg = {
        role: 'assistant',
        text: `Sorry, something went wrong: ${err.message || 'Unknown error'}`,
        error: true,
        time: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [input, loading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => setMessages([]);
  const showWelcome = messages.length === 0;

  return (
    <div className="chat-app">
      {/* Header */}
      <header className="chat-header">
        <div className="header-brand">
          <div className="header-logo"><IconBrain size={16} /></div>
          <div className="header-title">AETHER <span>RAG</span></div>
        </div>

        <div className="header-status">
          <span className={`status-dot ${online ? '' : 'offline'}`} />
          {online ? 'Connected' : 'Offline'}
        </div>

        <div className="header-actions">
          <button
            className="header-btn"
            title="Clear chat"
            onClick={clearChat}
            disabled={messages.length === 0}
          >
            <IconTrash />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="messages-area" ref={messagesRef}>
        {showWelcome ? (
          <div className="welcome-screen">
            <div className="welcome-icon"><IconBrain /></div>
            <h2>Ask anything about your documents</h2>
            <p>
              Hybrid semantic + keyword search with cross-encoder re-ranking
              to find the most relevant information across all uploaded documents.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className="suggestion-chip" onClick={() => handleSend(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            {loading && <TypingIndicator />}
          </>
        )}
      </div>

      {/* Input */}
      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents..."
            rows={1}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            title="Send message"
          >
            <IconSend />
          </button>
        </div>
        <div className="input-footer">
          <span>Enter to send · Shift+Enter for new line</span>
          <span>{input.length} chars</span>
        </div>
      </div>
    </div>
  );
}
