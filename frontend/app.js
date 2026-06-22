const API_BASE = window.location.origin;

// State management
let documents = [];
let activeFilters = {
    departments: new Set(),
    authors: new Set(),
    categories: new Set()
};
let pollingInterval = null;
let lastQuerySources = [];

// DOM Elements
const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const selectedFile = document.getElementById('selectedFile');
const selectedFileName = document.getElementById('selectedFileName');
const clearFileBtn = document.getElementById('clearFileBtn');
const documentsList = document.getElementById('documentsList');
const refreshDocsBtn = document.getElementById('refreshDocsBtn');

const filterHeader = document.getElementById('filterHeader');
const filterBar = document.querySelector('.filter-bar');
const filterDept = document.getElementById('filterDept');
const filterAuthor = document.getElementById('filterAuthor');
const filterCategory = document.getElementById('filterCategory');
const filterDocsCheckboxGroup = document.getElementById('filterDocsCheckboxGroup');

const chatContainer = document.getElementById('chatContainer');
const welcomeView = document.getElementById('welcomeView');
const chatMessages = document.getElementById('chatMessages');
const queryForm = document.getElementById('queryForm');
const queryInput = document.getElementById('queryInput');
const charCount = document.getElementById('charCount');

// Modal Elements
const detailsModal = document.getElementById('detailsModal');
const modalTitle = document.getElementById('modalTitle');
const modalDocName = document.getElementById('modalDocName');
const modalPage = document.getElementById('modalPage');
const modalScore = document.getElementById('modalScore');
const modalTextContent = document.getElementById('modalTextContent');
const closeModalBtn = document.getElementById('closeModalBtn');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    fetchDocuments();
    fetchConfig();
    setupEventListeners();
});

// Fetch Active Configuration
async function fetchConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/config`);
        if (!response.ok) throw new Error('Failed to load active configuration');
        const data = await response.json();
        
        // Update model indicator
        const modelIndicator = document.getElementById('modelIndicator');
        if (modelIndicator) {
            modelIndicator.innerHTML = `<i class="fa-solid fa-bolt"></i> LLM: ${data.llm_model}`;
        }
        
        // Update system DB engine badge
        const systemStats = document.querySelector('.system-stats');
        if (systemStats) {
            let dbBadge = document.getElementById('dbStatBadge');
            if (!dbBadge) {
                dbBadge = document.createElement('span');
                dbBadge.id = 'dbStatBadge';
                dbBadge.className = 'stat-badge';
                systemStats.appendChild(dbBadge);
            }
            dbBadge.innerHTML = `<i class="fa-solid fa-database"></i> DB: <strong>${data.database_type}</strong>`;
        }
    } catch (error) {
        console.error("Error loading config:", error);
    }
}

// Event Listeners Setup
function setupEventListeners() {
    // Dropzone Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('hover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('hover');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            fileInput.files = files;
            handleFileSelect();
        }
    });

    fileInput.addEventListener('change', handleFileSelect);
    clearFileBtn.addEventListener('click', clearFileSelection);

    // Document list refresh
    refreshDocsBtn.addEventListener('click', fetchDocuments);

    // Collapsible Filters
    filterHeader.addEventListener('click', () => {
        filterBar.classList.toggle('collapsed');
    });

    // Upload Submission
    uploadForm.addEventListener('submit', handleUploadSubmit);

    // Query Submission
    queryForm.addEventListener('submit', handleQuerySubmit);

    // Suggestion Buttons
    document.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            queryInput.value = btn.textContent;
            queryInput.dispatchEvent(new Event('input'));
            queryInput.focus();
        });
    });

    // Auto-growing Textarea & Character Count
    queryInput.addEventListener('input', () => {
        queryInput.style.height = 'auto';
        queryInput.style.height = (queryInput.scrollHeight) + 'px';
        charCount.textContent = `${queryInput.value.length} characters`;
    });

    // Enter key submits form (unless Shift is held)
    queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            queryForm.dispatchEvent(new Event('submit'));
        }
    });

    // Close Modal
    closeModalBtn.addEventListener('click', () => {
        detailsModal.style.display = 'none';
    });

    detailsModal.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
            detailsModal.style.display = 'none';
        }
    });
}

// File Selection Handler
function handleFileSelect() {
    if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        selectedFileName.textContent = file.name;
        dropzone.style.display = 'none';
        selectedFile.style.display = 'flex';
    }
}

function clearFileSelection() {
    fileInput.value = '';
    selectedFile.style.display = 'none';
    dropzone.style.display = 'block';
}

// Fetch Ingested Documents
async function fetchDocuments() {
    try {
        const response = await fetch(`${API_BASE}/api/documents`);
        if (!response.ok) throw new Error('Failed to load documents');
        
        documents = await response.json();
        renderDocumentsList();
        updateFilterOptions();
        
        // Start polling if any document is processing
        const hasProcessing = documents.some(doc => doc.status === 'processing');
        if (hasProcessing && !pollingInterval) {
            startPolling();
        } else if (!hasProcessing && pollingInterval) {
            stopPolling();
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Render Document Rows
function renderDocumentsList() {
    if (documents.length === 0) {
        documentsList.innerHTML = `
            <div class="empty-state-list">
                <i class="fa-solid fa-circle-info"></i>
                <p>No documents ingested yet.</p>
            </div>
        `;
        return;
    }

    documentsList.innerHTML = '';
    documents.forEach(doc => {
        const row = document.createElement('div');
        row.className = 'doc-row';
        
        let statusIcon = '';
        if (doc.status === 'processing') statusIcon = '<i class="fa-solid fa-spinner"></i>';
        else if (doc.status === 'completed') statusIcon = '<i class="fa-solid fa-circle-check"></i>';
        else statusIcon = '<i class="fa-solid fa-triangle-exclamation"></i>';

        const departmentTag = doc.department ? `<span class="meta-tag dept">${escapeHTML(doc.department)}</span>` : '';
        const categoryTag = doc.category ? `<span class="meta-tag category">${escapeHTML(doc.category)}</span>` : '';

        row.innerHTML = `
            <div class="doc-info">
                <div class="doc-name" title="${escapeHTML(doc.filename)}">${escapeHTML(doc.filename)}</div>
                <div class="doc-meta-tags">
                    <span class="status-badge ${doc.status}">
                        ${statusIcon} ${doc.status}
                    </span>
                    ${departmentTag}
                    ${categoryTag}
                </div>
            </div>
            <div class="doc-actions">
                <button class="trash-btn" onclick="deleteDocument('${doc.id}', event)" title="Delete document">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        
        if (doc.status === 'failed' && doc.error_message) {
            row.querySelector('.status-badge').setAttribute('title', doc.error_message);
        }
        
        documentsList.appendChild(row);
    });
}

// Ingestion Polling
function startPolling() {
    console.log("Starting document polling...");
    pollingInterval = setInterval(fetchDocuments, 3000);
}

function stopPolling() {
    console.log("Stopping document polling.");
    clearInterval(pollingInterval);
    pollingInterval = null;
}

// Delete Document
async function deleteDocument(docId, event) {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this document? All associated chunks and embedding vectors will be removed.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/documents/${docId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete document');
        
        showToast('Document and index vectors deleted successfully.', 'success');
        fetchDocuments();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Update Filters Form Options
function updateFilterOptions() {
    const prevDept = filterDept.value;
    const prevAuthor = filterAuthor.value;
    const prevCategory = filterCategory.value;

    activeFilters.departments.clear();
    activeFilters.authors.clear();
    activeFilters.categories.clear();

    documents.forEach(doc => {
        if (doc.status === 'completed') {
            if (doc.department) activeFilters.departments.add(doc.department);
            if (doc.author) activeFilters.authors.add(doc.author);
            if (doc.category) activeFilters.categories.add(doc.category);
        }
    });

    // Populate dropdowns
    populateSelect(filterDept, activeFilters.departments, 'All Departments', prevDept);
    populateSelect(filterAuthor, activeFilters.authors, 'All Authors', prevAuthor);
    populateSelect(filterCategory, activeFilters.categories, 'All Categories', prevCategory);

    // Populate document checkboxes
    const readyDocs = documents.filter(doc => doc.status === 'completed');
    if (readyDocs.length === 0) {
        filterDocsCheckboxGroup.innerHTML = '<span class="checkbox-placeholder">No documents ready for selection.</span>';
    } else {
        filterDocsCheckboxGroup.innerHTML = '';
        readyDocs.forEach(doc => {
            const label = document.createElement('label');
            label.className = 'doc-checkbox-label';
            label.innerHTML = `
                <input type="checkbox" value="${doc.id}" name="filterDocId">
                <span>${escapeHTML(doc.filename)}</span>
            `;
            
            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', () => {
                label.classList.toggle('selected', checkbox.checked);
            });
            
            filterDocsCheckboxGroup.appendChild(label);
        });
    }
}

function populateSelect(selectEl, valuesSet, defaultLabel, prevValue) {
    selectEl.innerHTML = `<option value="">${defaultLabel}</option>`;
    const sorted = Array.from(valuesSet).sort();
    sorted.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        if (val === prevValue) opt.selected = true;
        selectEl.appendChild(opt);
    });
}

// Handle Ingestion Form Submit
async function handleUploadSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(uploadForm);
    const file = fileInput.files[0];
    if (!file) {
        showToast('Please select a file to upload.', 'warning');
        return;
    }

    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.querySelector('.btn-text').textContent = 'Uploading...';

    try {
        const response = await fetch(`${API_BASE}/api/documents/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Ingestion failed');
        }

        showToast('Document uploaded successfully. Processing background pipeline...', 'success');
        clearFileSelection();
        uploadForm.reset();
        fetchDocuments();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.querySelector('.btn-text').textContent = 'Ingest & Index';
    }
}

// Handle RAG Query Form Submit
async function handleQuerySubmit(e) {
    e.preventDefault();
    const query = queryInput.value.trim();
    if (!query) return;

    // Reset layout on first query
    if (welcomeView.style.display !== 'none') {
        welcomeView.style.display = 'none';
        chatMessages.style.display = 'flex';
    }

    // Append User Message
    appendMessage('user', query);
    queryInput.value = '';
    queryInput.dispatchEvent(new Event('input')); // Reset height

    // Append Loading indicator
    const loadingMessageId = appendLoadingMessage();

    // Compile filters
    const selectedDocIds = Array.from(document.querySelectorAll('input[name="filterDocId"]:checked')).map(cb => cb.value);
    
    const requestBody = {
        query: query,
        filters: {
            department: filterDept.value || null,
            author: filterAuthor.value || null,
            category: filterCategory.value || null,
            doc_ids: selectedDocIds.length > 0 ? selectedDocIds : null
        }
    };

    try {
        const response = await fetch(`${API_BASE}/api/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error('Error processing search query');
        const data = await response.json();

        // Remove loading bubble
        removeMessage(loadingMessageId);

        // Store sources globally for modal lookups
        lastQuerySources = data.sources;

        // Append Assistant Message
        appendMessage('assistant', data.answer, data.sources, data.execution_time_sec);

    } catch (error) {
        removeMessage(loadingMessageId);
        appendMessage('assistant', `⚠️ An error occurred while retrieving content: ${error.message}`);
        showToast(error.message, 'error');
    }
}

// DOM Helper functions for chat message generation
function appendMessage(role, text, sources = [], execTime = null) {
    const msgWrapper = document.createElement('div');
    msgWrapper.className = `msg-wrapper ${role}`;
    
    const msgId = 'msg-' + Date.now();
    msgWrapper.id = msgId;

    let contentHTML = role === 'user' ? escapeHTML(text) : formatMarkdownAndCitations(text, sources);

    let headerName = role === 'user' ? 'YOU' : 'AETHER ASSISTANT';
    let extraHeader = execTime ? `<span style="font-size:9px;color:var(--text-muted);font-weight:normal;margin-left:8px;">(Retrieved & synthesized in ${execTime.toFixed(2)}s)</span>` : '';

    let sourcesAccordion = '';
    if (role === 'assistant' && sources && sources.length > 0) {
        sourcesAccordion = `
            <div class="sources-card">
                <div class="sources-trigger" onclick="toggleSources('${msgId}')">
                    <i class="fa-solid fa-chevron-down"></i> &nbsp; Retrieved Sources (${sources.length})
                </div>
                <div class="sources-list">
                    ${sources.map((src, index) => `
                        <div class="source-item" onclick="openSourceModal(${index})">
                            <div class="source-info-left">
                                <i class="fa-solid fa-file-lines"></i>
                                <div class="source-title-meta">
                                    ${escapeHTML(src.filename)} <span>Page ${src.page_number}</span>
                                </div>
                            </div>
                            <div class="source-score-right">Score: ${src.score.toFixed(3)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    msgWrapper.innerHTML = `
        <div class="message">
            <div class="message-header">${headerName} ${extraHeader}</div>
            <div class="message-content">${contentHTML}</div>
            ${sourcesAccordion}
        </div>
    `;

    chatMessages.appendChild(msgWrapper);
    scrollToBottom();
    return msgId;
}

function appendLoadingMessage() {
    const msgWrapper = document.createElement('div');
    msgWrapper.className = 'msg-wrapper assistant';
    
    const id = 'msg-loading-' + Date.now();
    msgWrapper.id = id;

    msgWrapper.innerHTML = `
        <div class="message">
            <div class="message-header">AETHER ASSISTANT</div>
            <div class="loading-bubble">
                <span>Searching indexes & synthesizing answer</span>
                <div class="dot-pulse">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    `;

    chatMessages.appendChild(msgWrapper);
    scrollToBottom();
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function toggleSources(msgId) {
    const trigger = document.querySelector(`#${msgId} .sources-trigger`);
    trigger.classList.toggle('active');
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Simple Markdown + Source Citation Parser
function formatMarkdownAndCitations(text, sources) {
    // 1. Escape HTML first
    let formatted = escapeHTML(text);

    // 2. Bold text (**text**)
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 3. Lists
    // Unordered (- item)
    formatted = formatted.replace(/(?:^|\n)-\s+([^\n]+)/g, '<li style="margin-left: 20px;">$1</li>');
    // Wrap consecutive list items in <ul>
    formatted = formatted.replace(/(?:<li[^>]*>.*?<\/li>\s*)+/g, (match) => `<ul style="margin-bottom: 10px;">${match}</ul>`);

    // 4. Line Breaks
    formatted = formatted.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    formatted = `<p>${formatted}</p>`;
    // Fix paragraphs wrapping ul elements
    formatted = formatted.replace(/<p>\s*<ul/g, '<ul').replace(/<\/ul>\s*<\/p>/g, '</ul>');

    // 5. Replace Citations: [Source: filename, Page: number]
    // We parse it using regex and add onclick events to open details modal
    const citationRegex = /\[Source:\s*([^,\]]+),\s*Page:\s*(\d+)\]/gi;
    
    formatted = formatted.replace(citationRegex, (match, docName, pageNum) => {
        // Try to find matching chunk index in our local sources list
        const pageInt = parseInt(pageNum);
        const sourceIndex = sources.findIndex(src => 
            src.filename.toLowerCase() === docName.toLowerCase() && 
            src.page_number === pageInt
        );

        if (sourceIndex !== -1) {
            return `<a class="citation-link" onclick="openSourceModal(${sourceIndex})"><i class="fa-solid fa-bookmark"></i> [${escapeHTML(docName)} p.${pageInt}]</a>`;
        } else {
            // If not found directly in current response context (should not happen)
            return `<span class="citation-link muted">[${escapeHTML(docName)} p.${pageInt}]</span>`;
        }
    });

    return formatted;
}

// Modal Citation Reader
function openSourceModal(sourceIndex) {
    const source = lastQuerySources[sourceIndex];
    if (!source) return;

    modalTitle.textContent = `Source Reference #${sourceIndex + 1}`;
    modalDocName.textContent = source.filename;
    modalPage.textContent = source.page_number;
    modalScore.textContent = source.score.toFixed(4);
    modalTextContent.innerHTML = escapeHTML(source.text);

    detailsModal.style.display = 'flex';
}

// Toast Notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '<i class="fa-solid fa-info"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    else if (type === 'error') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
    else if (type === 'warning') icon = '<i class="fa-solid fa-circle-exclamation"></i>';

    toast.innerHTML = `
        ${icon}
        <span>${escapeHTML(message)}</span>
    `;

    const container = document.getElementById('toastContainer');
    container.appendChild(toast);

    // Fade out and remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Helpers
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
