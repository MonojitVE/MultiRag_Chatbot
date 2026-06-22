/**
 * Shared API service for the Admin Panel.
 * All fetch calls go through here so the admin key header
 * is injected consistently from the auth context.
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}, adminKey = '') {
  const headers = {
    ...(options.headers || {}),
  };
  if (adminKey) headers['X-Admin-Key'] = adminKey;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    throw new ApiError(detail, res.status);
  }

  // Handle 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// ── Public endpoints (no admin key needed) ──────────────────────────────────
export const getConfig = () => request('/api/config');
export const getDocuments = () => request('/api/documents');
export const getDocument = (id) => request(`/api/documents/${id}`);

// ── Admin-protected endpoints ─────────────────────────────────────────────
export const uploadDocument = (formData, adminKey, onProgress) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/documents/upload`);
    if (adminKey) xhr.setRequestHeader('X-Admin-Key', adminKey);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let detail = `HTTP ${xhr.status}`;
        try { detail = JSON.parse(xhr.responseText).detail || detail; } catch {}
        reject(new ApiError(detail, xhr.status));
      }
    });

    xhr.addEventListener('error', () => reject(new ApiError('Network error', 0)));
    xhr.send(formData);
  });
};

export const deleteDocument = (id, adminKey) =>
  request(`/api/documents/${id}`, { method: 'DELETE' }, adminKey);
