import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { uploadDocument } from '../services/api';

const ALLOWED_EXT = ['pdf', 'docx', 'txt'];
const MAX_MB = 25;

function fileExt(name) { return name.split('.').pop().toLowerCase(); }
function fileIcon(ext) { return { pdf: '📄', docx: '📝', txt: '📃' }[ext] || '📁'; }
function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

function FileItem({ file, index, onRemove, progress, done, failed }) {
  return (
    <div className="file-item">
      <span className="file-item-icon">{fileIcon(fileExt(file.name))}</span>
      <div className="file-item-info">
        <div className="file-item-name" title={file.name}>{file.name}</div>
        <div className="file-item-size">{fmtSize(file.size)}</div>
        {progress !== undefined && (
          <div className="progress-bar-track">
            <div
              className={`progress-bar-fill ${failed ? 'fill-red' : done ? 'fill-green' : ''}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      {onRemove && (
        <button className="file-item-remove" onClick={() => onRemove(index)}>✕</button>
      )}
    </div>
  );
}

export default function Upload({ onTabChange }) {
  const { adminKey } = useAuth();
  const { addToast } = useToast();

  const [files, setFiles] = useState([]);
  const [dept, setDept] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({}); // idx → pct
  const [results, setResults] = useState(null);
  const inputRef = useRef();

  const addFiles = useCallback((newFiles) => {
    const valid = [];
    for (const f of newFiles) {
      const ext = fileExt(f.name);
      if (!ALLOWED_EXT.includes(ext)) {
        addToast(`"${f.name}" — unsupported format (PDF, DOCX, TXT only).`, 'warning');
        continue;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        addToast(`"${f.name}" exceeds ${MAX_MB} MB limit.`, 'warning');
        continue;
      }
      valid.push(f);
    }
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...valid.filter(f => !names.has(f.name + f.size))];
    });
    setResults(null);
  }, [addToast]);

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    addFiles(Array.from(e.dataTransfer.files));
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setProgress({});
    setResults(null);

    let ok = 0, fail = 0;
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const fd = new FormData();
      fd.append('file', f);
      if (dept)     fd.append('department', dept);
      if (author)   fd.append('author', author);
      if (category) fd.append('category', category);

      try {
        await uploadDocument(fd, adminKey, (pct) => {
          setProgress(prev => ({ ...prev, [i]: pct }));
        });
        setProgress(prev => ({ ...prev, [i]: 100 }));
        ok++;
      } catch (e) {
        setProgress(prev => ({ ...prev, [i]: -1 }));
        errors.push(`${f.name}: ${e.message}`);
        fail++;
      }
    }

    setResults({ ok, fail, errors });
    setUploading(false);

    if (fail === 0) {
      addToast(`${ok} file${ok > 1 ? 's' : ''} uploaded successfully!`, 'success');
      setFiles([]);
      setProgress({});
    } else if (ok > 0) {
      addToast(`${ok} uploaded, ${fail} failed.`, 'warning');
    } else {
      addToast('All uploads failed. Check your admin key and server.', 'error');
    }
  };

  return (
    <div className="tab-pane">
      <div className="page-header">
        <h2>☁️ Upload Documents</h2>
        <p>Drag &amp; drop multiple files or browse to add to the knowledge base</p>
      </div>

      <div className="upload-layout">
        {/* Drop zone */}
        <div className="upload-panel">
          <div
            className="dropzone"
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
            onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
            onDrop={handleDrop}
          >
            <div className="dropzone-inner">
              <div className="dropzone-icon">☁️</div>
              <p className="dropzone-title">Drop files here</p>
              <p className="dropzone-sub">PDF, DOCX, TXT · Max {MAX_MB} MB each</p>
              <button
                type="button"
                className="btn-browse"
                onClick={() => inputRef.current.click()}
              >
                📂 Browse Files
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt"
                style={{ display: 'none' }}
                onChange={e => { addFiles(Array.from(e.target.files)); e.target.value = ''; }}
              />
            </div>
          </div>

          {/* File queue */}
          {files.length > 0 && (
            <div className="file-queue">
              <div className="file-queue-header">
                <span>{files.length} file{files.length > 1 ? 's' : ''} selected</span>
                {!uploading && (
                  <button className="btn-text-sm" onClick={() => { setFiles([]); setProgress({}); setResults(null); }}>
                    Clear all
                  </button>
                )}
              </div>
              <div className="file-list">
                {files.map((f, i) => (
                  <FileItem
                    key={f.name + i}
                    file={f}
                    index={i}
                    onRemove={uploading ? null : removeFile}
                    progress={progress[i] !== undefined ? Math.abs(progress[i]) : undefined}
                    done={progress[i] === 100}
                    failed={progress[i] === -1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Metadata + submit */}
        <div className="upload-meta-panel">
          <h3 className="meta-panel-title">🏷️ Metadata <span className="meta-optional">(Optional)</span></h3>
          <p className="meta-panel-sub">Applied to all files in this batch</p>

          <div className="meta-fields">
            {[
              { id: 'dept',     label: '🏢 Department', val: dept,     set: setDept,     ph: 'e.g. HR, Engineering' },
              { id: 'author',   label: '👤 Author',     val: author,   set: setAuthor,   ph: 'e.g. John Doe'        },
              { id: 'category', label: '🗂️ Category',  val: category, set: setCategory, ph: 'e.g. Policy, Report'  },
            ].map(f => (
              <div key={f.id} className="field-group">
                <label htmlFor={f.id}>{f.label}</label>
                <input id={f.id} type="text" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} />
              </div>
            ))}
          </div>

          <button
            className="btn-upload"
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
          >
            {uploading ? (
              <><span className="btn-spinner" /> Uploading…</>
            ) : (
              '🚀 Ingest & Index'
            )}
          </button>

          {/* Results */}
          {results && (
            <div className={`upload-summary ${results.fail === 0 ? 'success' : results.ok > 0 ? 'partial' : 'error'}`}>
              {results.fail === 0
                ? `✓ All ${results.ok} files uploaded and queued for indexing.`
                : results.ok > 0
                  ? `⚠ ${results.ok} uploaded, ${results.fail} failed.`
                  : `✕ All uploads failed. Check your admin key.`}
            </div>
          )}

          {results && results.ok > 0 && (
            <button className="btn-sm" style={{ marginTop: 12 }} onClick={() => onTabChange('documents')}>
              📁 View Documents →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
