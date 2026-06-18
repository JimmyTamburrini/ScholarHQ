# ScholarHQ Security Setup

## Auth provider used
ScholarHQ now uses the existing Node backend for production-shaped authentication because the app was a static/local-first app and no provider SDK was installed. Sessions are issued as `HttpOnly`, `SameSite=Lax` cookies from `/api/auth/*`. A Supabase-ready schema and RLS policy file is included at `supabase/schema.sql` for migration to Supabase Auth.

## Required environment variables
Server-only: `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`.
Public-safe: `PUBLIC_APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`.
See `.env.example` for placeholders. Do not commit `.env`; it is ignored by Git.

## Protected routes
Private API routes call `requireUser()` from `api/security.js`, which reads the signed-in user from the server-side session cookie. Protected routes include auth `/me`, profiles, study sessions, AI generation, and Google Calendar connection/sync/disconnect.

## User ownership enforcement
Every persisted private record has `user_id`. API handlers ignore frontend-supplied `user_id` and use the authenticated user's id from `requireUser()`. Study session reads, updates, and deletes filter by both `id` and authenticated `user_id`, returning `404` when a record is not owned by the current user.

## Supabase RLS
`supabase/schema.sql` creates `profiles`, `study_sessions`, `ai_usage_logs`, and `calendar_connections`. RLS is enabled on each table. Policies allow select/insert/update/delete only when `auth.uid() = user_id`.

## OpenAI security
OpenAI calls happen only in backend API routes. The backend reads `OPENAI_API_KEY` (legacy `SCHOLARHQ_API` still works as a fallback), requires authentication, rate-limits per user, and logs token usage to `ai_usage_logs` when OpenAI returns usage data.

## Google Calendar preparation
Google OAuth starts from backend routes only after authentication. Status, sync, and disconnect are authenticated. Refresh tokens remain server-side; production deployments should store encrypted tokens in `calendar_connections` using `TOKEN_ENCRYPTION_KEY` or Supabase/database encryption before enabling broad release.

## Manual security checklist
- Logged-out `/api/study-coach`, `/api/study-plan`, `/api/profile`, `/api/study-sessions`, and calendar routes return `401`.
- Signup/login set an `HttpOnly` session cookie.
- Logout clears the session cookie and subsequent private requests return `401`.
- User A cannot retrieve, update, or delete User B's study session id.
- Invalid JSON and invalid field values return `400`.
- Repeated login/signup/forgot-password/AI requests eventually return `429`.
- Browser bundle contains no `OPENAI_API_KEY`, service-role key, Google client secret, or database URL.

## Before production
- Move `.data/security-db.json` storage to Supabase/Postgres or another managed database.
- Wire email delivery for verification and password reset tokens.
- Enable encryption-at-rest for Google tokens using `TOKEN_ENCRYPTION_KEY`.
- Configure production CSP domains if additional analytics/assets are added.
