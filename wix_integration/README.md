# Wix Integration Guide

## Overview

This guide explains how to connect your existing Wix chatbot to the Multi-Document RAG backend. The integration works through **Wix Velo** (formerly Corvid), which lets you write backend JavaScript that Wix executes on its servers.

---

## Architecture

```
Wix Chat Widget
      ↓  (user sends message)
Wix Page Script / Chatbot Trigger
      ↓  calls
Wix Velo Backend (http-functions.js)  ← you paste code here
      ↓  HTTP POST
Your FastAPI RAG Backend (/api/wix-chat)
      ↓  runs RAG pipeline
Returns AI answer + source citations
      ↑  back to Wix → displayed in chat
```

---

## Step-by-Step Setup

### 1. Deploy Your Backend

Make sure your FastAPI server is running and **publicly accessible** (not just localhost). Options:
- Deploy to **AWS EC2 / ECS**
- Deploy to **Railway, Render, or Fly.io**
- Use **ngrok** for local testing: `ngrok http 8000`

Note your public URL, e.g.: `https://api.yourcompany.com`

### 2. Configure CORS

In your `.env` file, add your Wix domain to allow cross-origin requests:

```env
WIX_ALLOWED_ORIGINS=https://yoursite.wixsite.com,https://www.yoursite.com
```

Restart the server after changing `.env`.

### 3. Add Velo to Your Wix Site

1. Open your **Wix Editor**
2. Click **Dev Mode** in the top menu bar
3. Enable **Velo by Wix** if not already enabled
4. A **left sidebar** with file structure will appear

### 4. Create the Backend Function

1. In the Velo sidebar, expand **Backend**
2. If `http-functions.js` doesn't exist, create it: right-click **Backend** → **New File** → name it `http-functions.js`
3. Open the file and **paste the entire contents** of [`http-functions.js`](./http-functions.js)
4. Replace the URL on this line:
   ```js
   const RAG_BACKEND_URL = 'https://YOUR_BACKEND_URL/api/wix-chat';
   ```
   With your actual backend URL:
   ```js
   const RAG_BACKEND_URL = 'https://api.yourcompany.com/api/wix-chat';
   ```
5. (Optional) Set a default department filter:
   ```js
   const DEFAULT_DEPARTMENT = 'Support';  // or '' for all docs
   ```

### 5. Connect Your Wix Chatbot

#### Option A: Wix Chat with Automations (Recommended)
1. Go to **Wix Dashboard → Automations**
2. Create a new automation triggered by **Chat message received**
3. Set the action to call your Velo function `post_ragChat`
4. Map the user's message to the `message` field in the request body

#### Option B: Custom Button + Page Script
Add a button or form on your Wix page and wire it up with this page script:

```javascript
// In Wix page script (e.g., Home.js)
import { fetch } from 'wix-fetch';

$w.onReady(function () {
    $w('#sendBtn').onClick(async () => {
        const userMessage = $w('#messageInput').value;
        
        const response = await fetch('/_functions/ragChat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage })
        });
        
        const data = await response.json();
        $w('#answerText').text = data.reply;
    });
});
```

### 6. Test the Integration

You can test the backend endpoint directly before connecting Wix:

```bash
curl -X POST https://api.yourcompany.com/api/wix-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the return policy?", "session_id": "test-123"}'
```

Expected response:
```json
{
  "reply": "According to the uploaded documents...",
  "sources": [
    {"filename": "policy.pdf", "page_number": 3, "score": 0.94}
  ],
  "session_id": "test-123",
  "execution_time_sec": 1.45
}
```

### 7. Publish Your Wix Site

Click **Publish** in the Wix editor to make the Velo backend function live.

---

## Request / Response Reference

### Request (POST `/_functions/ragChat`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | ✅ Yes | The user's question |
| `session_id` | string | ❌ No | Optional session identifier for tracking |
| `department` | string | ❌ No | Filter docs by department (e.g. "HR") |

### Response

| Field | Type | Description |
|-------|------|-------------|
| `reply` | string | The AI-generated answer |
| `sources` | array | List of source documents used |
| `sources[].filename` | string | Name of the source document |
| `sources[].page` | int | Page number in the source doc |
| `sources[].relevance` | string | Relevance score as percentage |
| `execution_time_sec` | float | Time taken by the RAG pipeline |

---

## Rate Limits

The `/api/wix-chat` endpoint is rate-limited to **10 requests per minute per IP address** to prevent abuse. If Wix exceeds this, the endpoint returns HTTP 429.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `CORS error` | Add your Wix domain to `WIX_ALLOWED_ORIGINS` in `.env` |
| `401 Unauthorized` | The endpoint is public — you shouldn't see this. Check if you're hitting the wrong path. |
| `Empty reply: "No relevant documents found"` | Upload documents via the Admin Panel first |
| `429 Rate limit exceeded` | Wix is sending too many requests. Add client-side debouncing. |
| `Backend unreachable` | Check that your server is publicly deployed and firewall allows port 8000 |

---

## Security Notes

- The `/api/wix-chat` endpoint is **intentionally public** — no API key required, since Wix users are end users.
- Admin operations (upload/delete) require `X-Admin-Key` header and should **never be called from Wix frontend**.
- Rate limiting prevents abuse (10 req/min/IP).
- The Admin Panel at `/admin` is password-protected via your `ADMIN_API_KEY`.
