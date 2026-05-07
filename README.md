# ScholarHQ

ScholarHQ is a local-first student productivity website built to help students log study sessions, track classes, calculate weighted grades and GPA, and review study trends from one clean dashboard.

# Active Demo HTML is uploaded here: https://jimmytamburrini.github.io/productivity-hub-overview/
# Active Website is uploaded here: https://jimmytamburrini.github.io/ScholarHQ/ DO NOT SHARE

The app runs entirely in the browser using HTML, CSS, JavaScript, and `localStorage`, so no backend setup is required for the current version.

## What It Does

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
- `Sessions`: add, edit, delete, and sort study sessions
- `Classes`: manage gradebooks, weighted grades, GPA, and class details
- `Charts`: weekly time charts and grade-vs-study analytics
- `Stats`: study breakdowns and performance insights
- `Calendar`: placeholder for planned calendar sync features

## Key Behaviors

- Study sessions are stored locally in the browser
- Class gradebooks are stored locally in the browser
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

## Project Structure

```text
index.html
src/
  app.bundle.js
  styles.css
```

## Run Locally

Because this is a static browser app, you can run it very simply:

1. Clone or download the repository
2. Find the index.html file in the project folder once downloaded to your desktop
3. Right-click to 'Open-with' and select your desired browser

If you prefer, you can also serve it with a small local server.

## Main Files

- `index.html` - app entry point
- `src/app.bundle.js` - app logic, rendering, state, storage, and interactivity
- `src/styles.css` - visual design, layout, theme, and responsive styling
- `netlify/functions/study-coach.js` - serverless AI endpoint for the Home page coach
- `netlify.toml` - Netlify publish and functions configuration

## AI Study Coach Setup

This project now includes AI features on the Home page:

- `AI Study Coach`
- `AI Study Plan` with researched topic guidance from your logged assignments and exams

To enable it:

1. Deploy the project to Netlify
2. Add an environment variable named `OPENAI_API_KEY`
3. Optionally add `OPENAI_MODEL` if you want to override the default model
4. Redeploy the site

The frontend sends your study data to the Netlify function, and the function calls the OpenAI API securely from the server side.

## Design Direction

Goal for the website is to be fully functional study tracker/planner designed to help students eliminate the excuses as to why they arent acheiving their academic goals. Allow students to identify their key weaknesses of their study process and eliminate them to succeed.

## Future Ideas

- Google Calendar two-way sync
- Smart study scheduling around exams and availability
- D2L / Brightspace integration
- Mobile app rebuild with React Native

## Status

This version is currently local-first and browser-based. It is designed as a strong foundation for a future full web app or mobile app with authentication, cloud sync, and calendar integrations.
I also have multiple versions saved to my computer for us to eventuallly push to github, but they all require a backend program to use the AI features in. It costs money, which we do not have yet.
In order to do so, we need a solid pitch to get accepted into the launch rogram to get funding.
