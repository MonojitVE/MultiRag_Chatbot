/**
 * Shared API service for the Chat Frontend.
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = j.detail || detail; } catch {}
    throw new ApiError(detail, res.status);
  }
  return res.json();
}

export const getConfig = () => request('/api/config');
export const getDocuments = () => request('/api/documents');

export const sendQuery = (query, filters) =>
  request('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, filters }),
  });
