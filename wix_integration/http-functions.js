// ════════════════════════════════════════════════════════════════════════
// Wix Velo — http-functions.js
// 
// SETUP: Paste this entire file into your Wix site's Velo editor at:
//        Backend → http-functions.js
//
// After pasting, replace RAG_BACKEND_URL with your deployed server URL.
//
// Wix HTTP functions docs:
//   https://support.wix.com/en/article/velo-exposing-a-site-api-with-http-functions
// ════════════════════════════════════════════════════════════════════════

import { ok, badRequest, serverError } from 'wix-http-functions';
import { fetch } from 'wix-fetch';

// ── CONFIGURATION ─────────────────────────────────────────────────────────
// Replace with your actual backend URL (e.g. https://api.yourcompany.com)
const RAG_BACKEND_URL = 'https://YOUR_BACKEND_URL/api/wix-chat';

// Optional: restrict to a specific department by default
// e.g. 'Support', 'HR', 'Engineering' — or leave empty for all docs
const DEFAULT_DEPARTMENT = '';

// ════════════════════════════════════════════════════════════════════════
// POST /_functions/ragChat
//
// This function is called by your Wix chatbot or a form/button widget.
// 
// Expected request body (JSON):
//   {
//     "message": "What is the refund policy?",
//     "session_id": "optional-user-session-id",
//     "department": "optional-department-filter"
//   }
//
// Returns:
//   {
//     "reply": "Based on the documents...",
//     "sources": [{"filename": "...", "page_number": 1, "score": 0.95}],
//     "execution_time_sec": 1.23
//   }
// ════════════════════════════════════════════════════════════════════════
export async function post_ragChat(request) {
    try {
        // Parse request body
        let body;
        try {
            body = await request.body.json();
        } catch {
            return badRequest({
                body: JSON.stringify({ error: 'Invalid JSON in request body.' }),
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Validate message
        const message = (body.message || '').trim();
        if (!message) {
            return badRequest({
                body: JSON.stringify({ error: 'message field is required and cannot be empty.' }),
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Forward to RAG backend
        const ragResponse = await fetch(RAG_BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                session_id: body.session_id || null,
                department: body.department || DEFAULT_DEPARTMENT || null,
            }),
        });

        const data = await ragResponse.json();

        if (!ragResponse.ok) {
            const errMsg = data.detail || `Backend returned HTTP ${ragResponse.status}`;
            console.error('[RAG Wix] Backend error:', errMsg);
            return serverError({
                body: JSON.stringify({ error: errMsg }),
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Return success response
        return ok({
            body: JSON.stringify({
                reply: data.reply,
                sources: (data.sources || []).map(s => ({
                    filename: s.filename,
                    page: s.page_number,
                    relevance: Math.round(s.score * 100) + '%'
                })),
                execution_time_sec: data.execution_time_sec,
            }),
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('[RAG Wix] Unexpected error:', err);
        return serverError({
            body: JSON.stringify({ error: 'Internal error: ' + err.message }),
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// ════════════════════════════════════════════════════════════════════════
// GET /_functions/ragHealth
// 
// Optional health check endpoint — useful for monitoring.
// Call this from Wix to verify the RAG backend is reachable.
// ════════════════════════════════════════════════════════════════════════
export async function get_ragHealth(request) {
    try {
        const res = await fetch(RAG_BACKEND_URL.replace('/wix-chat', '/config'));
        const data = await res.json();
        return ok({
            body: JSON.stringify({ status: 'ok', backend: data }),
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return serverError({
            body: JSON.stringify({ status: 'unreachable', error: err.message }),
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
