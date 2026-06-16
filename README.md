# ScholarHQ

ScholarHQ is a student productivity website built to help students log study sessions, track classes, calculate weighted grades and GPA, review study trends, and generate AI study plans from one dashboard.

# Active Demo HTML is uploaded here: https://jimmytamburrini.github.io/productivity-hub-overview/

The core study tracker runs in the browser using HTML, CSS, JavaScript, and `localStorage`. The AI coach, study planner, and Google Calendar integration use a Render-hosted Node API so private keys stay on the server.

## What It Does

- Create an account, log in, and keep each user's study data in a separate workspace
- Log study sessions with subject, date, duration, notes, category, and optional assignment or exam details
- Track classes with weighted assignment entries and a running GPA for each class
- View semester GPA across classes with saved weighted grades
- Compare weekly study time by class on the Charts page
- Review `Grade vs Study Time` analytics based on study time leading up to assignments and exams
- Explore summary stats like total study time, average session length, class distribution, and study patterns
- Use a built-in study timer from the Home page
- Generate AI study coach feedback and AI study plans from server-side API routes
- Connect Google Calendar with OAuth and sync saved study sessions as calendar events

## Current Pages

- `Home`: overview, timer, AI coach, AI planner, and quick productivity summary
- `Classes`: manage gradebooks, weighted grades, GPA, and class details
- `Sessions`: add, edit, delete, and sort study sessions
- `Charts`: weekly time charts and grade-vs-study analytics
- `Stats`: study breakdowns and performance insights
- `Calendar`: Google OAuth connection status plus saved-session syncing into Google Calendar

## Key Behaviors

- Account login and signup use Supabase Auth when configured
- Study sessions and class gradebooks sync to Supabase by account when configured
- A local browser cache remains available for resilience
- If a study session includes assignment info and a grade, it can publish into the matching class gradebook automatically
- Grade-vs-study comparisons use matching subject, matching assignment name, sessions categorized as `study`, and a 14-day lookback window before the assignment or exam

## Tech Stack

- `HTML`
- `CSS`
- `JavaScript`
- Browser `localStorage`
- Supabase Auth and data storage
- Render Web Service
- Node.js API routes

## Project Structure

```text
index.html
src/
  app.bundle.js
  styles.css
api/
  study-coach.js
  study-plan.js
  google-calendar.js
supabase/
  schema.sql
server.js
render.yaml
```

## Run Locally

Use the same Node server used on Render:

```bash
npm install
npm start
```

The ScholarHQ command runner also supports the requested command style when the package binary is available:

```bash
scholar start
```

## Main Files

- `index.html` - app entry point
- `src/app.bundle.js` - app logic, rendering, state, storage, and interactivity
- `src/styles.css` - visual design, layout, theme, and responsive styling
- `api/study-coach.js` - Render-hosted AI endpoint for the Home page coach
- `api/study-plan.js` - Render-hosted AI endpoint for the study planner
- `api/google-calendar.js` - Google OAuth, token refresh, connection status, and Calendar event creation endpoint
- `supabase/schema.sql` - account-scoped cloud storage table and row-level security policies
- `server.js` - Node server that serves the static app and API routes
- `render.yaml` - Render Blueprint configuration

## AI Study Coach Setup on Render

This project includes AI features on the Home page:

- `AI Study Coach`
- `AI Study Plan` with researched topic guidance from logged assignments and exams

To enable it on Render:

1. Create a Render Web Service from this repository, or use the included `render.yaml` Blueprint.
2. Set `OPENAI_API_KEY` or `SCHOLARHQ_API` to your OpenAI API key. `OPENAI_API_KEY` is preferred; `SCHOLARHQ_API` remains supported for existing Render deployments.
3. Add `SUPABASE_URL`.
4. Add `SUPABASE_ANON_KEY`.
5. Optionally add `OPENAI_MODEL` if you want to override the default model.
6. Use the Node runtime. The included Render Blueprint runs `npm install` and starts the app with `npm start`.
7. Redeploy the service after saving environment variables.

If Render says the OpenAI key is incorrect even though the value looks right, make sure the value is pasted without surrounding quotes. The server trims accidental whitespace and matching quotes before sending the key to OpenAI.

The frontend sends study data to Render API routes at `/api/study-coach` and `/api/study-plan`. The server also accepts the older `/.netlify/functions/study-coach` and `/.netlify/functions/study-plan` paths for compatibility.

## Supabase Accounts + Cloud Sync Setup

1. Create a Supabase project
2. In Supabase SQL Editor, run `supabase/schema.sql`
3. Enable Email auth in Supabase Authentication settings
4. Copy your project URL and anon key
5. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Render environment variables

After this, each user signs in with email/password, and their sessions, grades, and class gradebooks sync to their own account row.

## Google Calendar Setup

This project includes the backend pieces needed for Google Calendar event creation. The frontend Calendar page connects the logged-in ScholarHQ browser account to Google OAuth, checks connection status, and syncs up to five saved study sessions into the user's primary Google Calendar.

After creating your Google Cloud project:

1. Enable the Google Calendar API.
2. Configure the OAuth consent screen.
3. Create an OAuth Client ID with type `Web application`.
4. Add this authorized redirect URI for local development:

```text
http://localhost:3000/api/google/callback
```

5. On Render, add the deployed callback URL too, for example:

```text
https://your-render-service.onrender.com/api/google/callback
```

6. Add these environment variables locally or in Render:

```bash
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
PUBLIC_APP_URL=http://localhost:3000
GOOGLE_OAUTH_STATE_SECRET=replace-with-a-long-random-string
GOOGLE_CALENDAR_TIME_ZONE=America/New_York
```

The app requests the narrow `https://www.googleapis.com/auth/calendar.events` scope so ScholarHQ can create and update calendar events without full calendar access. OAuth token exchange and event creation stay on the Node backend; do not put Google client secrets in browser code.

For this prototype, Google refresh tokens are saved in `.data/google-calendar-tokens.json`, which is ignored by Git. A production launch should move those tokens into an encrypted database tied to real server-side user accounts.

## Design Direction

Goal for the website is to be a fully functional study tracker/planner designed to help students eliminate the excuses around why they are not achieving their academic goals. It should help students identify the key weaknesses of their study process and eliminate them.

## Future Ideas

- Google Calendar two-way sync
- Smart study scheduling around exams and availability
- D2L / Brightspace integration
- Mobile app rebuild with React Native

## Status

This version supports Supabase-backed account access and per-user cloud sync when configured, while still keeping a local browser cache for resilience. Google Calendar and AI features require backend environment variables on Render. Do not commit real API keys, OAuth secrets, or passwords to the repository.
