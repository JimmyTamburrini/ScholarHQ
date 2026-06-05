# ScholarHQ

ScholarHQ is a local-first student productivity website built to help students log study sessions, track classes, calculate weighted grades and GPA, and review study trends from one clean dashboard.

# Active Demo HTML is uploaded here: https://jimmytamburrini.github.io/productivity-hub-overview/


The core study tracker runs in the browser using HTML, CSS, JavaScript, and `localStorage`. The AI coach and study planner now use a small Render-hosted Node API so the OpenAI key stays on the server.

## What It Does

- Create a local account, log in, and keep each browser user's study data in a separate workspace
- Log study sessions with subject, date, duration, notes, category, and optional assignment or exam details
- Track classes with weighted assignment entries and a running GPA for each class
- View semester GPA across classes with saved weighted grades
- Compare weekly study time by class on the Charts page
- Review `Grade vs Study Time` analytics based on study time leading up to assignments and exams
- Explore summary stats like total study time, average session length, class distribution, and study patterns
- Use a built-in study timer from the Home page
- Reserve a Calendar page for future Google Calendar integration

## Current Pages

- `Home`: overview, timer, and quick productivity summary
- `Classes`: manage gradebooks, weighted grades, GPA, and class details
- `Sessions`: add, edit, delete, and sort study sessions
- `Charts`: weekly time charts and grade-vs-study analytics
- `Stats`: study breakdowns and performance insights
- `Calendar`: placeholder for planned calendar sync features

## Key Behaviors

- Account login and signup currently run locally in the browser as a backend-ready prototype
- Study sessions are stored locally in the browser under the signed-in account
- Class gradebooks are stored locally in the browser under the signed-in account
- If a study session includes assignment info and a grade, it can publish into the matching class gradebook automatically
- Grade-vs-study comparisons use:
  - matching subject
  - matching assignment name
  - sessions categorized as `study`
  - a 14-day lookback window before the assignment or exam

## Tech Stack

- `HTML`
- `CSS`
- `JavaScript`
- Browser `localStorage`
- Render Web Service
- Node.js API routes

## Project Structure

```text
index.html
src/
  app.bundle.js
  styles.css
```

## Run Locally

Because this is a static browser app, you can run it very simply. The first screen now asks you to create a local ScholarHQ account before opening the dashboard.

1. Clone or download the repository
2. Find the index.html file in the project folder once downloaded to your desktop
3. Right-click to 'Open-with' and select your desired browser

If you prefer, you can also serve it with the same `scholar start` command used on Render:

```bash
npm install
npm install --global .
scholar start
```

You can also use the npm wrapper locally without installing the global command:

```bash
npm start
```

## Main Files

- `index.html` - app entry point
- `src/app.bundle.js` - app logic, rendering, state, storage, and interactivity
- `src/styles.css` - visual design, layout, theme, and responsive styling
- `api/study-coach.js` - Render-hosted AI endpoint for the Home page coach
- `api/study-plan.js` - Render-hosted AI endpoint for the study planner
- `server.js` - Node server that serves the static app and AI API routes
- `render.yaml` - Render Blueprint configuration

## AI Study Coach Setup on Render

This project now includes AI features on the Home page:

- `AI Study Coach`
- `AI Study Plan` with researched topic guidance from your logged assignments and exams

To enable it on Render, create a **Web Service** instead of a Static Site. The AI features need the Node server because the API key must stay server-side.

### Option A: Use the included Render Blueprint

1. Push this repository to GitHub.
2. In Render, choose **Blueprints** and connect this repository.
3. Render will read `render.yaml`, run `npm ci && npm install --global .`, and start the service with `scholar start`.
4. Add the secret environment variable `SCHOLARHQ_API` in Render and set it to your OpenAI API key. Do not commit the key to this repository.
5. Leave `OPENAI_MODEL` blank to use the default `gpt-5-mini`, or set it only to a model your OpenAI project can access. If Render still has an older inaccessible model saved, remove `OPENAI_MODEL` or change it to `gpt-5-mini`.
6. Deploy the service, then open `https://YOUR-SERVICE.onrender.com/healthz`. It should return `{"status":"ok","service":"scholarhq"}`.
7. Open your Render service URL and use the app from that URL, not from `file://`, so the browser can call `/api/study-coach` and `/api/study-plan`.

### Option B: Create the Render Web Service manually

Use these settings when creating the service:

- **Service type:** Web Service
- **Runtime:** Node
- **Build command:** `npm ci && npm install --global .`
- **Start command:** `scholar start`
- **Environment variable:** `SCHOLARHQ_API` = your OpenAI API key
- **Optional environment variable:** `OPENAI_MODEL` = a model your OpenAI project can access. Leave it blank to use `gpt-5-mini`; avoid older models your OpenAI project cannot access.

The frontend sends your study data to Render API routes at `/api/study-coach` and `/api/study-plan`, and the Render server calls the OpenAI API securely from the server side.

## Design Direction

Goal for the website is to be fully functional study tracker/planner designed to help students eliminate the excuses as to why they arent acheiving their academic goals. Allow students to identify their key weaknesses of their study process and eliminate them to succeed.

## Future Ideas

- Google Calendar two-way sync
- Smart study scheduling around exams and availability
- D2L / Brightspace integration
- Mobile app rebuild with React Native

## Status

This version is currently local-first and browser-based. It now includes a local-only authentication gate so students can create accounts and keep browser data separated, but those accounts are not secure server accounts yet. Do not use real passwords until a backend database and production auth provider are connected. It is designed as a strong foundation for a future full web app or mobile app with authentication, cloud sync, and calendar integrations.
I also have multiple versions saved to my computer for us to eventuallly push to github, but they all require a backend program to use the AI features in. It costs money, which we do not have yet.
In order to do so, we need a solid pitch to get accepted into the launch rogram to get funding.

## Plan

Currently we have a onboarding/account creation method. It is just not secure. We need to adjust this to create a actual usable website to go public. Once done, we can start to find a custom domain, trademark, and brand. Everything will cost money including subscriptions for the AI implementation, google calander implementation, Render hosting subscription, and of course custom domain for the Render site. I have added updated plans for the Render hosting subscription into "Discussions"

WOOHOOO MONEY SPENDING!!
