SURAH AL-MULK RECITATION PRACTICE WEBSITE
========================================

OPEN THE WEBSITE
1. Extract the ZIP file.
2. Open the folder in Visual Studio Code.
3. Install the VS Code extension named "Live Server" if you do not already have it.
4. Right-click index.html and choose "Open with Live Server".
5. Your browser will open a localhost address. Use Chrome or Edge.
6. Create a demo account, sign in, and choose Start test.

WHY LIVE SERVER?
Microphone access normally requires HTTPS or localhost. Do not open the app as a file:// page if microphone access is blocked.

WHAT IS IMPLEMENTED
- Emerald-green and gold responsive design.
- Registration and login demo flow.
- Dashboard with test count and latest attempt.
- Random selection of verses 1-10, 11-20, or 21-30.
- Loads the selected ten Uthmani Arabic verses from the Quran.com public v4 endpoint.
- Shows only the first verse as the test prompt.
- Plays the opening verse using the Mishary Alafasy audio file pattern.
- Microphone recording, timer, stop, and in-page playback.
- Saves attempt details and audio recording in this browser (IndexedDB).
- Results page with attempt details, the full ten-verse text, and sequential reference-audio playback.
- Test history with play and download controls for saved recordings.
- Recording download from the results page.

IMPORTANT LIMITATIONS — READ BEFORE USING WITH REAL STUDENTS
1. This is a front-end learning prototype. Registration, login, and history are stored in the browser on one device. They are not secure production accounts and do not sync across devices.
2. The Qur'an text request uses the older public Quran.com v4 endpoint. The Quran Foundation's current Content API requires server-side credentials. If the public endpoint is unavailable or changes, the verse text will not load. Do not put API client secrets in app.js.
3. Mishary audio is streamed from the Alafasy verse-audio path. Audio availability, hotlinking, redistribution, and usage permissions are controlled by the audio provider. The app does not download or redistribute the audio files.
4. The user's recording is stored in the browser's IndexedDB on that device. It is not uploaded to a teacher or server. Clearing browser data may delete it.
5. No automatic recitation correctness or Tajweed score is generated. A reliable grading system needs a validated Qur'anic-recitation assessment engine, or a qualified teacher reviewing the recording. This app deliberately shows "Review needed" instead of inventing a score.
6. Do not use this prototype to collect real passwords or sensitive student data. Before public launch, add a secure backend, password hashing on the server, database, private audio storage, access controls, privacy notice, and HTTPS.

PROJECT FILES
- index.html  : website pages and layout
- style.css   : emerald/gold responsive styling
- app.js      : login demo, random test, Quran text/audio loading, recording, history

REFERENCE DOCUMENTATION
- Quran Foundation API overview: https://api-docs.quran.com/docs/api-reference/
- Quran Foundation authentication guidance: https://api-docs.quran.com/docs/quickstart/
- Quran Foundation audio documentation: https://api-docs.quran.com/docs/content_apis_versioned/4.0.0/recitation-audio-files/

NEXT STEP FOR A PUBLIC/PRODUCTION VERSION
Set up a small backend (for example, Node.js + Express), connect a database, configure the official Quran Foundation API credentials on the server, and select a validated Qur'anic-recitation/Tajweed assessment provider or qualified human-review workflow. Never expose the API client secret in browser JavaScript.
