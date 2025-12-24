# Beatly Backend API

Backend API server for Beatly music streaming platform.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase
- **Payment**: Midtrans, DOKU
- **AI**: Google Gemini
- **External APIs**: Spotify, YouTube

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `env.example` to `.env.local`:

```bash
cp env.example .env.local
```

Then fill in your API keys and configuration.

### 3. Run Development Server

```bash
npm run dev
```

The server will start at `http://localhost:3001`

### 4. Build for Production

```bash
npm run build
npm start
```

## Deployment to Vercel

1. Push this folder to a GitHub repository
2. Connect the repository to Vercel
3. Set environment variables in Vercel Dashboard
4. **PENTING**: Set `FRONTEND_URL` ke URL Hostinger Anda
5. Deploy!

## API Endpoints

- `GET /api` - Health check
- `GET /api/playlists` - List playlists
- `GET /api/spotify/*` - Spotify API proxy
- `GET /api/youtube/*` - YouTube API proxy
- `POST /api/doku/*` - DOKU payment gateway
- `POST /api/midtrans/*` - Midtrans payment gateway
- Dan lainnya...

## CORS Configuration

Backend ini dikonfigurasi untuk menerima request dari:
- Domain frontend Hostinger Anda (set via `FRONTEND_URL`)
- `localhost:3000` (untuk development)

Untuk menambah origin lain, update `ALLOWED_ORIGINS` environment variable (comma-separated).
