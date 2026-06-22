/* ═══════════════════════════════════════════════════════════════════════
   AETHER RAG — Admin Panel JavaScript
   Handles: Auth gate, tab navigation, document management,
            batch file upload with progress, stats dashboard,
            settings panel, and Wix code generation.
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Configuration ──────────────────────────────────────────────────────────
const API_BASE = '';  // Same origin. Change to 'http://your-server:8000' if different origin
const ADMIN_KEY_STORAGE = 'rag_admin_key';
const REFRESH_INTERVAL_MS = 8000;  // Poll for processing docs every 8s

// ── State ──────────────────────────────────────────────────────────────────
let adminKey = '';
let selectedFiles = [];    // File objects queued for upload
let refreshTimer = null;   // Auto-refresh timer
let allDocs = [];          // Cached document list
let pendingDeleteId = null;

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function fmt(n) { return n === undefined || n === null ? '—' : String(n); }

function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1048576).toFixed(1)} MB`;
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function fileIcon(ext) {
    return { pdf: 'fa-file-pdf', docx: 'fa-file-word', txt: 'fa-file-lines' }[ext] || 'fa-file';
}

// ── Toast Notifications ────────────────────────────────────────────────────
function toast(msg, type = 'info') {
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type]} ${type}"></i><span>${msg}</span>`;
    document.getElementById('toastStack').appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-out');
        setTimeout(() => el.remove(), 350);
    }, 3500);
}

// ── API helper ─────────────────────────────────────────────────────────────
async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (adminKey) headers['X-Admin-Key'] = adminKey;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); detail = j.detail || detail; } catch {}
        throw new Error(detail);
    }
    return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH GATE
// ═══════════════════════════════════════════════════════════════════════════

function checkSavedKey() {
    const saved = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (saved) { adminKey = saved; showApp(); }
}

async function validateKey(key) {
    // We validate by calling a protected endpoint
    try {
        await fetch(`${API_BASE}/api/documents`, {
            method: 'GET',
            headers: { 'X-Admin-Key': key }
        });
        // If server returns 401 specifically for key check, we test upload endpoint
        const res = await fetch(`${API_BASE}/api/documents`, {
            method: 'GET',
            headers: {}
        });
        // List is public, so we test with a tiny dummy check
        // Actually, validate by trying to fetch config
        const cfgRes = await fetch(`${API_BASE}/api/config`);
        return cfgRes.ok;
    } catch {
        return false;
    }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = document.getElementById('adminKeyInput').value.trim();
    if (!key) return;

    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.querySelector('.btn-login-text').textContent = 'Verifying…';

    // Lightweight validation: just see if the server is reachable
    try {
        await fetch(`${API_BASE}/api/config`);
        // Server is up — store key (full auth tested on first write)
        adminKey = key;
        sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
        showApp();
    } catch {
        showLoginError('Could not connect to server. Make sure the backend is running.');
        btn.disabled = false;
        btn.querySelector('.btn-login-text').textContent = 'Access Admin Panel';
    }
});

function showLoginError(msg) {
    const err = document.getElementById('loginError');
    document.getElementById('loginErrorMsg').textContent = msg;
    err.style.display = 'flex';
}

// Toggle password visibility
document.getElementById('toggleKeyVisibility').addEventListener('click', () => {
    const input = document.getElementById('adminKeyInput');
    const icon  = document.getElementById('eyeIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
});

function showApp() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    init();
}

function logout() {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    adminKey = '';
    location.reload();
}

document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('logoutBtnSettings')?.addEventListener('click', logout);

// ═══════════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

const tabLabels = { dashboard: 'Dashboard', documents: 'Documents', upload: 'Upload', settings: 'Settings' };

function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const pane = document.getElementById(`tab${capitalize(tabId)}`);
    if (pane) pane.classList.add('active');

    const nav = document.getElementById(`nav${capitalize(tabId)}`);
    if (nav) nav.classList.add('active');

    document.getElementById('breadcrumbPage').textContent = tabLabels[tabId] || tabId;

    if (tabId === 'dashboard') loadDashboard();
    if (tabId === 'documents') loadDocumentsTable();
    if (tabId === 'settings')  loadSettings();
}

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(item.dataset.tab);
    });
});

// Quick action buttons
document.querySelectorAll('[data-tab]').forEach(btn => {
    if (!btn.classList.contains('nav-item')) {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

async function loadDashboard() {
    try {
        const docs = await api('/api/documents');
        allDocs = docs;
        updateStats(docs);
        renderRecentDocs(docs.slice(0, 8));
        updateSidebarCount(docs.length);
    } catch(e) {
        toast('Failed to load dashboard: ' + e.message, 'error');
    }
}

function updateStats(docs) {
    const total = docs.length;
    const indexed    = docs.filter(d => d.status === 'completed').length;
    const processing = docs.filter(d => d.status === 'processing').length;
    const failed     = docs.filter(d => d.status === 'failed').length;

    document.getElementById('statTotalVal').textContent      = total;
    document.getElementById('statIndexedVal').textContent    = indexed;
    document.getElementById('statProcessingVal').textContent = processing;
    document.getElementById('statFailedVal').textContent     = failed;

    // Auto-refresh if any processing
    if (processing > 0) startAutoRefresh();
    else stopAutoRefresh();
}

function renderRecentDocs(docs) {
    const el = document.getElementById('recentDocsList');
    if (!docs.length) {
        el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No documents yet. Upload your first document.</p></div>';
        return;
    }
    el.innerHTML = docs.map(d => `
        <div class="recent-doc-item">
            <div class="doc-icon"><i class="fa-solid ${fileIcon(d.file_type)}"></i></div>
            <div class="doc-info">
                <div class="doc-name">${escHtml(d.filename)}</div>
                <div class="doc-meta">${fmtDate(d.upload_timestamp)} &bull; ${d.department || 'No dept'}</div>
            </div>
            ${statusBadge(d.status)}
        </div>
    `).join('');
}

function updateSidebarCount(n) {
    document.getElementById('sidebarDocCount').textContent = n;
}

document.getElementById('dashRefreshBtn').addEventListener('click', loadDashboard);

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS TABLE
// ═══════════════════════════════════════════════════════════════════════════

async function loadDocumentsTable() {
    try {
        const docs = await api('/api/documents');
        allDocs = docs;
        updateSidebarCount(docs.length);
        renderTable(docs);
        if (docs.some(d => d.status === 'processing')) startAutoRefresh();
        else stopAutoRefresh();
    } catch(e) {
        toast('Failed to load documents: ' + e.message, 'error');
    }
}

function renderTable(docs) {
    const searchVal  = (document.getElementById('docSearch').value || '').toLowerCase();
    const statusVal  = document.getElementById('filterStatus').value;

    const filtered = docs.filter(d => {
        const matchSearch = !searchVal ||
            d.filename.toLowerCase().includes(searchVal) ||
            (d.department || '').toLowerCase().includes(searchVal) ||
            (d.author || '').toLowerCase().includes(searchVal);
        const matchStatus = !statusVal || d.status === statusVal;
        return matchSearch && matchStatus;
    });

    const tbody = document.getElementById('docsTableBody');
    if (!filtered.length) {
        tbody.innerHTML = `<tr class="table-empty-row"><td colspan="8"><div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No documents match your filters.</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(d => `
        <tr>
            <td class="filename"><span title="${escHtml(d.filename)}"><i class="fa-solid ${fileIcon(d.file_type)}" style="color:var(--indigo-light);margin-right:8px;"></i>${escHtml(d.filename)}</span></td>
            <td><span class="badge" style="background:var(--indigo-dim);color:var(--indigo-light)">${d.file_type.toUpperCase()}</span></td>
            <td>${escHtml(d.department || '—')}</td>
            <td>${escHtml(d.author || '—')}</td>
            <td>${statusBadge(d.status)}</td>
            <td>${fmtDate(d.upload_timestamp)}</td>
            <td>${d.s3_url
                ? `<a class="s3-link" href="${d.s3_url}" target="_blank" title="Open in S3"><i class="fa-solid fa-link"></i></a>`
                : '<span style="color:var(--text-muted);font-size:.75rem">Local</span>'
            }</td>
            <td>
                <button class="btn-delete-doc" data-id="${d.id}" data-name="${escHtml(d.filename)}">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // Wire delete buttons
    tbody.querySelectorAll('.btn-delete-doc').forEach(btn => {
        btn.addEventListener('click', () => showDeleteModal(btn.dataset.id, btn.dataset.name));
    });
}

// Filter/search live
['docSearch', 'filterStatus'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => renderTable(allDocs));
});

document.getElementById('docsRefreshBtn').addEventListener('click', loadDocumentsTable);

// ── Status Badge HTML ──────────────────────────────────────────────────────
function statusBadge(status) {
    const map = {
        completed:  `<span class="badge completed"><i class="fa-solid fa-circle-check"></i> Indexed</span>`,
        processing: `<span class="badge processing"><i class="fa-solid fa-spinner"></i> Processing</span>`,
        failed:     `<span class="badge failed"><i class="fa-solid fa-circle-xmark"></i> Failed</span>`,
    };
    return map[status] || `<span class="badge">${status}</span>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE MODAL
// ═══════════════════════════════════════════════════════════════════════════

function showDeleteModal(docId, docName) {
    pendingDeleteId = docId;
    document.getElementById('deleteModalMsg').textContent =
        `"${docName}" will be permanently removed — chunks, vectors, and any S3 object.`;
    document.getElementById('deleteModal').style.display = 'flex';
}

document.getElementById('deleteCancelBtn').addEventListener('click', () => {
    document.getElementById('deleteModal').style.display = 'none';
    pendingDeleteId = null;
});

document.getElementById('deleteConfirmBtn').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const btn = document.getElementById('deleteConfirmBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting…';

    try {
        await api(`/api/documents/${pendingDeleteId}`, { method: 'DELETE' });
        toast('Document deleted successfully.', 'success');
        document.getElementById('deleteModal').style.display = 'none';
        pendingDeleteId = null;
        await loadDocumentsTable();
        updateStats(allDocs);
    } catch(e) {
        toast('Delete failed: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete';
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// FILE UPLOAD — Dropzone + Batch Upload
// ═══════════════════════════════════════════════════════════════════════════

const dropzone  = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');

// Browse button
document.getElementById('browseBtn').addEventListener('click', () => fileInput.click());

// File input change
fileInput.addEventListener('change', () => addFiles(Array.from(fileInput.files)));

// Drag & drop
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    addFiles(Array.from(e.dataTransfer.files));
});

function addFiles(newFiles) {
    const allowed = ['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'];
    const extOk   = ['pdf', 'docx', 'txt'];

    newFiles.forEach(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        if (!extOk.includes(ext)) {
            toast(`"${f.name}" is not supported (PDF, DOCX, TXT only).`, 'warning');
            return;
        }
        if (f.size > 25 * 1024 * 1024) {
            toast(`"${f.name}" exceeds 25 MB.`, 'warning');
            return;
        }
        if (selectedFiles.some(s => s.name === f.name && s.size === f.size)) return; // dedupe
        selectedFiles.push(f);
    });

    renderFileQueue();
    fileInput.value = '';  // Reset so same file can be re-added
}

function renderFileQueue() {
    const queue = document.getElementById('fileQueue');
    const list  = document.getElementById('fileList');
    const uploadBtn = document.getElementById('uploadBtn');

    if (!selectedFiles.length) {
        queue.style.display = 'none';
        uploadBtn.disabled = true;
        return;
    }

    queue.style.display = 'block';
    uploadBtn.disabled = false;
    document.getElementById('fileQueueTitle').textContent =
        `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected`;

    list.innerHTML = selectedFiles.map((f, i) => `
        <div class="file-item" id="fileItem${i}">
            <i class="fa-solid ${fileIcon(f.name.split('.').pop())} file-item-icon"></i>
            <div class="file-item-info">
                <div class="file-item-name" title="${escHtml(f.name)}">${escHtml(f.name)}</div>
                <div class="file-item-size">${fmtSize(f.size)}</div>
            </div>
            <button class="file-item-remove" data-idx="${i}" title="Remove"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');

    list.querySelectorAll('.file-item-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedFiles.splice(parseInt(btn.dataset.idx), 1);
            renderFileQueue();
        });
    });
}

document.getElementById('clearQueueBtn').addEventListener('click', () => {
    selectedFiles = [];
    renderFileQueue();
    document.getElementById('uploadSummary').style.display = 'none';
});

// ── Upload Logic ───────────────────────────────────────────────────────────
document.getElementById('uploadBtn').addEventListener('click', () => {
    if (!selectedFiles.length) return;
    uploadAllFiles();
});

async function uploadAllFiles() {
    const department = document.getElementById('metaDept').value.trim();
    const author     = document.getElementById('metaAuthor').value.trim();
    const category   = document.getElementById('metaCategory').value.trim();

    const uploadBtn    = document.getElementById('uploadBtn');
    const uploadText   = document.getElementById('uploadBtn').querySelector('.btn-upload-text');
    const uploadSpinner= document.getElementById('uploadSpinner');
    const progressList = document.getElementById('progressList');
    const summary      = document.getElementById('uploadSummary');

    uploadBtn.disabled = true;
    uploadText.style.display = 'none';
    uploadSpinner.style.display = 'block';
    progressList.style.display  = 'flex';
    summary.style.display = 'none';

    // Build progress rows
    progressList.innerHTML = selectedFiles.map((f, i) => `
        <div class="progress-item" id="prog${i}">
            <div class="progress-item-header">
                <span class="progress-item-name">${escHtml(f.name)}</span>
                <span class="prog-pct" id="pct${i}">0%</span>
            </div>
            <div class="progress-bar-track">
                <div class="progress-bar-fill" id="bar${i}" style="width:0%"></div>
            </div>
        </div>
    `).join('');

    let successCount = 0;
    let failCount = 0;

    // Upload one by one to show individual progress (XHR for progress events)
    for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i];
        try {
            await uploadSingleWithProgress(f, i, department, author, category);
            successCount++;
            document.getElementById(`pct${i}`).textContent = '✓ Done';
            document.getElementById(`bar${i}`).style.background = 'var(--green)';
        } catch(e) {
            failCount++;
            document.getElementById(`pct${i}`).textContent = '✗ Failed';
            document.getElementById(`bar${i}`).style.background = 'var(--red)';
            document.getElementById(`bar${i}`).style.width = '100%';
            console.error(`Upload failed for ${f.name}:`, e);
        }
    }

    // Summary
    summary.style.display = 'block';
    if (failCount === 0) {
        summary.className = 'upload-summary success';
        summary.innerHTML = `<i class="fa-solid fa-circle-check"></i> All ${successCount} file${successCount>1?'s':''} uploaded and queued for indexing.`;
        toast(`${successCount} file(s) uploaded successfully!`, 'success');
        selectedFiles = [];
        renderFileQueue();
    } else if (successCount > 0) {
        summary.className = 'upload-summary partial';
        summary.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${successCount} uploaded, ${failCount} failed.`;
        toast(`${successCount} uploaded, ${failCount} failed.`, 'warning');
    } else {
        summary.className = 'upload-summary error';
        summary.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> All uploads failed. Check console for details.`;
        toast('Upload failed. Check admin key and server status.', 'error');
    }

    uploadBtn.disabled = false;
    uploadText.style.display = 'flex';
    uploadSpinner.style.display = 'none';

    // Refresh document list and start polling
    await loadDashboard();
    startAutoRefresh();
}

function uploadSingleWithProgress(file, idx, department, author, category) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        if (department) formData.append('department', department);
        if (author)     formData.append('author', author);
        if (category)   formData.append('category', category);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/api/documents/upload`);
        xhr.setRequestHeader('X-Admin-Key', adminKey);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                document.getElementById(`bar${idx}`).style.width = `${pct}%`;
                document.getElementById(`pct${idx}`).textContent  = `${pct}%`;
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                document.getElementById(`bar${idx}`).style.width = '100%';
                resolve(JSON.parse(xhr.responseText));
            } else {
                let detail = `HTTP ${xhr.status}`;
                try { detail = JSON.parse(xhr.responseText).detail || detail; } catch {}
                reject(new Error(detail));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.send(formData);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════

async function loadSettings() {
    try {
        const cfg = await api('/api/config');
        document.getElementById('cfgProvider').textContent = cfg.llm_provider || '—';
        document.getElementById('cfgModel').textContent    = cfg.llm_model    || '—';
        document.getElementById('cfgDb').textContent       = cfg.database_type || '—';
        document.getElementById('cfgS3').textContent       = cfg.s3_enabled ? '✓ Enabled' : '✗ Disabled (local)';
        document.getElementById('cfgBucket').textContent   = cfg.s3_bucket   || '—';
    } catch(e) {
        toast('Failed to load settings: ' + e.message, 'error');
    }
    renderWixCode();
}

function renderWixCode() {
    const serverUrl = `${window.location.protocol}//${window.location.host}`;
    const code = `// ════════════════════════════════════════════════════════
// Wix Velo — http-functions.js
// Paste this in: Backend → http-functions.js
// Docs: https://support.wix.com/en/article/velo-exposing-a-site-api-with-http-functions
// ════════════════════════════════════════════════════════
import { ok, badRequest, serverError } from 'wix-http-functions';
import { fetch } from 'wix-fetch';

const RAG_BACKEND_URL = '${serverUrl}/api/wix-chat';

/**
 * POST /_functions/ragChat
 * Called by your Wix chatbot trigger.
 * Body: { "message": "user question here" }
 */
export async function post_ragChat(request) {
    try {
        const body = await request.body.json();

        if (!body.message) {
            return badRequest({ body: JSON.stringify({ error: 'Message is required.' }) });
        }

        const response = await fetch(RAG_BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: body.message,
                session_id: body.session_id || null,
                department: body.department || null,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return serverError({ body: JSON.stringify({ error: data.detail || 'Backend error' }) });
        }

        return ok({
            body: JSON.stringify({
                reply: data.reply,
                sources: data.sources,
                execution_time_sec: data.execution_time_sec,
            }),
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (err) {
        return serverError({ body: JSON.stringify({ error: err.message }) });
    }
}`;

    document.getElementById('wixCode').textContent = code;
}

// Copy Wix code
document.getElementById('copyWixCode').addEventListener('click', () => {
    const code = document.getElementById('wixCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('copyWixCode');
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        toast('Code copied to clipboard!', 'success');
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="fa-solid fa-copy"></i>';
        }, 2000);
    });
});

// Show/hide current key
document.getElementById('showKeyBtn').addEventListener('click', () => {
    const dots = document.getElementById('keyDots');
    if (dots.textContent.includes('●')) {
        dots.textContent = adminKey || '(not set)';
        document.getElementById('showKeyBtn').innerHTML = '<i class="fa-solid fa-eye-slash"></i> Hide';
    } else {
        dots.textContent = '●●●●●●●●●●●●●●●●';
        document.getElementById('showKeyBtn').innerHTML = '<i class="fa-solid fa-eye"></i> Show Current';
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// TOPBAR STATUS
// ═══════════════════════════════════════════════════════════════════════════

async function loadTopbarStatus() {
    try {
        const cfg = await api('/api/config');
        document.getElementById('llmLabel').textContent   = `${cfg.llm_provider}: ${cfg.llm_model}`;
        document.getElementById('s3Label').textContent    = `S3: ${cfg.s3_enabled ? 'Enabled' : 'Local'}`;
        document.getElementById('statusDot').className    = 'status-dot online';
        document.getElementById('statusLabel').textContent = 'Connected';
    } catch {
        document.getElementById('statusDot').className    = 'status-dot offline';
        document.getElementById('statusLabel').textContent = 'Offline';
        document.getElementById('llmLabel').textContent   = 'Unreachable';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-REFRESH (poll while docs are processing)
// ═══════════════════════════════════════════════════════════════════════════

function startAutoRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(async () => {
        try {
            const docs = await api('/api/documents');
            allDocs = docs;
            updateStats(docs);
            updateSidebarCount(docs.length);
            const activePane = document.querySelector('.tab-pane.active');
            if (activePane?.id === 'tabDocuments') renderTable(docs);
            if (activePane?.id === 'tabDashboard') renderRecentDocs(docs.slice(0, 8));
            if (!docs.some(d => d.status === 'processing')) stopAutoRefresh();
        } catch {}
    }, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR TOGGLE (mobile)
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('collapsed');
});

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════

function init() {
    loadTopbarStatus();
    loadDashboard();
    switchTab('dashboard');
}

// ── Boot ────────────────────────────────────────────────────────────────────
checkSavedKey();
