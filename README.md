# Zhyra AI OS

**The Operating System for AI Employees**

Zhyra is an enterprise-grade AI agent platform for creating, managing, and deploying AI employees. Built with React (Vite) frontend and FastAPI backend.

## Production

- **Frontend**: https://zhyra.web.app (Firebase Hosting)
- **Backend API**: https://zhyra.web.app/api (Firebase Hosting → Cloud Run)
- **Health Check**: https://zhyra.web.app/api/health

## Architecture

```
https://zhyra.web.app
        │
        ▼
Firebase Hosting
        │
        ├── Zhyra Frontend (React/Vite)
        │
        └── /api/**
                │
                ▼
            Cloud Run (zhyra-api)
            FastAPI
                │
       ┌────────┼─────────┐
       ▼        ▼         ▼
   Firebase   Qdrant   AI Providers
   Auth       RAG      (Gemini/OpenAI/
   Firestore           Claude/OpenRouter)
   Storage
```

## Tech Stack

### Frontend
- React 19 + TypeScript
- Vite (build tool)
- TailwindCSS v4
- Firebase SDK (Auth, Firestore, Storage)
- Framer Motion (animations)
- Zustand (state management)
- TanStack Query (data fetching)

### Backend
- FastAPI (Python 3.12)
- Firebase Admin SDK (Auth verification, Firestore)
- LangGraph (AI agent orchestration)
- Qdrant (vector database for RAG)
- Cloudflare R2 (document storage)

### Integrations
- Google Calendar, Gmail, Drive
- Slack
- HubSpot, Shopify
- Razorpay, ElevenLabs, Google Maps, WhatsApp

## Local Development

### Frontend
```bash
npm install
npm run dev
# Runs at http://localhost:5173
```

### Backend
```bash
cd backend
cp .env.example .env
# Fill in your .env values
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Runs at http://localhost:8000
```

## Deployment

### Prerequisites
- Firebase CLI (`npm install -g firebase-tools`)
- Google Cloud SDK (`gcloud`)
- Docker

### Frontend (Firebase Hosting)
```bash
npm run build
firebase deploy --only hosting --project zhyra-e0d80
```

### Backend (Cloud Run)
```bash
cd backend
docker build -t gcr.io/zhyra-e0d80/zhyra-api .
docker push gcr.io/zhyra-e0d80/zhyra-api
gcloud run deploy zhyra-api \
  --image gcr.io/zhyra-e0d80/zhyra-api \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

### Set Cloud Run Secrets
```bash
# Set environment variables in Cloud Run (not committed to Git)
gcloud run services update zhyra-api \
  --region us-central1 \
  --set-env-vars FIREBASE_PROJECT_ID=zhyra-e0d80 \
  --set-secrets ENCRYPTION_KEY=zhyra-encryption-key:latest \
  --set-secrets GEMINI_API_KEY=zhyra-gemini-key:latest \
  # ... other secrets
```

## Environment Variables

See `backend/.env.example` for all required environment variables.

**Never commit `.env` files or service account JSON files to Git.**

## CI

GitHub Actions runs on every push:
- Frontend build check
- Backend Python syntax check

See `.github/workflows/ci.yml`.
