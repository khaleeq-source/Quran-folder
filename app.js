/* Surah Al-Mulk practice app — front-end prototype.
   For production, replace local demo auth/storage with a secure backend. */
const STORAGE_USERS = "almulk_demo_users_v2";
const STORAGE_SESSION = "almulk_demo_session_v2";
const STORAGE_TESTS = "almulk_demo_tests_v2";
const AUDIO_DB_NAME = "almulk_recordings";
const AUDIO_DB_STORE = "recordings";
const QURAN_API = "https://api.quran.com/api/v4";
const AUDIO_BASE = "https://verses.quran.com/Alafasy/mp3/";

let currentUser = null;
let selectedSection = null;
let currentAttempt = null;
let sectionVerses = [];
let mediaRecorder = null;
let activeStream = null;
let recordedChunks = [];
let recordingBlob = null;
let recordingUrl = null;
let recordingStartedAt = null;
let timerInterval = null;
let elapsedSeconds = 0;
let referenceAudioQueue = [];
let referenceAudioIndex = 0;
let verseRatings = Array(10).fill(null);

const sections = [
  { start: 1, end: 10, label: "Verses 1–10" },
  { start: 11, end: 20, label: "Verses 11–20" },
  { start: 21, end: 30, label: "Verses 21–30" }
];
const $ = id => document.getElementById(id);

function readStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function writeStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}
function setView(name) {
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
  const target = $("view-" + name);
  if (target) target.classList.add("active");
  document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "dashboard") renderDashboard();
  if (name === "history") renderHistory();
}
document.addEventListener("click", event => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  const destination = button.dataset.view;
  if (["dashboard", "history", "test", "result"].includes(destination) && !currentUser) {
    showToast("Please log in first."); setView("login"); return;
  }
  setView(destination);
});

function refreshHeader() {
  $("dashboard-nav").hidden = !currentUser;
  $("history-nav").hidden = !currentUser;
  const actions = $("header-actions");
  if (currentUser) {
    actions.innerHTML = `<span class="user-greeting">Hi, ${escapeHtml(currentUser.name.split(" ")[0])}</span><button class="btn btn-ghost" id="logout-button">Log out</button>`;
    $("logout-button").addEventListener("click", logout);
  } else {
    actions.innerHTML = `<button class="btn btn-ghost" data-view="login">Log in</button><button class="btn btn-gold btn-small" data-view="register">Create account</button>`;
  }
}
async function hashPassword(password) {
  if (!crypto.subtle) return password; // local-only fallback; never use this prototype for real accounts
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function getUserTests() {
  if (!currentUser) return [];
  return readStore(STORAGE_TESTS, readStore("almulk_demo_tests", [])).filter(test => test.email === currentUser.email).sort((a,b) => b.createdAt - a.createdAt);
}

$("register-form").addEventListener("submit", async event => {
  event.preventDefault();
  const name = $("register-name").value.trim();
  const email = $("register-email").value.trim().toLowerCase();
  const password = $("register-password").value;
  if (name.length < 2) return showToast("Please enter your full name.");
  const users = readStore(STORAGE_USERS, readStore("almulk_demo_users", []));
  if (users.some(user => user.email === email)) return showToast("An account with this email already exists.");
  users.push({ name, email, passwordHash: await hashPassword(password) });
  writeStore(STORAGE_USERS, users);
  currentUser = { name, email };
  sessionStorage.setItem(STORAGE_SESSION, email);
  refreshHeader(); $("register-form").reset();
  showToast("Account created. Welcome!"); setView("dashboard");
});
$("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const email = $("login-email").value.trim().toLowerCase();
  const passwordHash = await hashPassword($("login-password").value);
  const user = readStore(STORAGE_USERS, readStore("almulk_demo_users", [])).find(item => item.email === email && (item.passwordHash === passwordHash || item.password === $("login-password").value));
  if (!user) return showToast("Email or password is incorrect.");
  currentUser = { name: user.name, email: user.email };
  sessionStorage.setItem(STORAGE_SESSION, email);
  refreshHeader(); $("login-form").reset(); showToast("You are now logged in."); setView("dashboard");
});
function logout() {
  stopReferenceAudio();
  currentUser = null; sessionStorage.removeItem(STORAGE_SESSION); refreshHeader();
  showToast("You have logged out."); setView("home");
}
function renderDashboard() {
  if (!currentUser) return;
  const tests = getUserTests();
  $("student-name").textContent = currentUser.name.split(" ")[0];
  $("student-avatar").textContent = currentUser.name.trim().charAt(0).toUpperCase();
  $("stat-tests").textContent = tests.length;
  $("stat-last").textContent = tests.length ? new Date(tests[0].createdAt).toLocaleDateString() : "—";
  const gradedTests = tests.filter(test => Number.isFinite(Number(test.percentage)));
  const average = gradedTests.length
    ? Math.round(gradedTests.reduce((sum, test) => sum + Number(test.percentage), 0) / gradedTests.length)
    : null;
  const averageElement = $("stat-avg");
  if (averageElement) averageElement.textContent = average === null ? "—" : `${average}%`;
  renderTestList($("dashboard-recent"), tests.slice(0, 3));
}
function openAudioDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB is unavailable"));
    const request = window.indexedDB.open(AUDIO_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(AUDIO_DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveAttemptRecording(id, blob) {
  const db = await openAudioDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_DB_STORE, "readwrite");
    tx.objectStore(AUDIO_DB_STORE).put(blob, id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function getAttemptRecording(id) {
  const db = await openAudioDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_DB_STORE, "readonly");
    const request = tx.objectStore(AUDIO_DB_STORE).get(id);
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
function renderTestList(container, tests) {
  if (!tests.length) {
    container.innerHTML = `<div class="empty-state">No test attempts yet. Start your first assessment when you're ready.</div>`;
    return;
  }
  container.innerHTML = tests.map(test => `
    <article class="history-item">
      <div><strong>${escapeHtml(test.section)}</strong><small>${new Date(test.createdAt).toLocaleString()} · ${Math.floor(test.duration / 60)}m ${test.duration % 60}s recording</small>
      <div class="history-audio-actions"><button class="text-button" data-recording-action="play" data-attempt-id="${escapeHtml(test.id)}">Play recording</button><button class="text-button" data-recording-action="download" data-attempt-id="${escapeHtml(test.id)}">Download</button></div>
      <audio class="history-audio" controls hidden></audio></div>
      <span class="history-status">${escapeHtml(test.status || "Submitted · review pending")}</span>
    </article>`).join("");
}
function renderHistory() { renderTestList($("full-history"), getUserTests()); }

$("start-test").addEventListener("click", async () => {
  selectedSection = sections[Math.floor(Math.random() * sections.length)];
  stopReferenceAudio(); resetRecorder();
  $("test-range").textContent = selectedSection.label;
  $("recording-note").textContent = "Record and stop your attempt before submitting.";
  $("opening-verse").textContent = "Loading verified Qur'an text…";
  $("opening-verse-number").textContent = `Surah 67 · Verse ${selectedSection.start}`;
  $("play-opening").disabled = true;
  $("test-source-status").textContent = "Loading verse text and reference recitation…";
  setView("test");
  await loadSelectedVerses();
});

async function loadSelectedVerses() {
  try {
    const response = await fetch(`${QURAN_API}/verses/by_chapter/67?fields=text_uthmani&per_page=50`);
    if (!response.ok) throw new Error(`Qur'an text service returned ${response.status}`);
    const data = await response.json();
    const allVerses = data.verses || [];
    sectionVerses = allVerses.filter(verse => {
      const number = Number(String(verse.verse_key || "").split(":")[1]);
      return number >= selectedSection.start && number <= selectedSection.end;
    });
    if (sectionVerses.length !== 10 || sectionVerses.some(verse => !verse.text_uthmani)) throw new Error("The complete ten-verse text was not returned.");
    $("opening-verse").textContent = sectionVerses[0].text_uthmani;
    $("play-opening").disabled = false;
    $("test-source-status").textContent = "Text loaded. Reference audio is provided by the Mishary Alafasy audio stream.";
  } catch (error) {
    sectionVerses = [];
    $("opening-verse").textContent = "Could not load the verse text. Please check your internet connection and try again.";
    $("test-source-status").textContent = "Qur'an text could not be loaded. No test has started.";
    showToast("Unable to load Qur'an text. Please try again.");
  }
}
function audioUrl(verseNumber) {
  return `${AUDIO_BASE}067${String(verseNumber).padStart(3, "0")}.mp3`;
}
function playOpeningVerse() {
  if (!selectedSection) return;
  const audio = $("reference-audio");
  audio.src = audioUrl(selectedSection.start);
  audio.play().catch(() => showToast("The reference audio could not play. Check your connection or browser audio settings."));
}
$("play-opening").addEventListener("click", playOpeningVerse);

$("record-button").addEventListener("click", startRecording);
$("stop-button").addEventListener("click", stopRecording);
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast("This browser does not support microphone recording. Try an updated Chrome browser on HTTPS or localhost."); return;
  }
  try {
    activeStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    recordedChunks = [];
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
    mediaRecorder = new MediaRecorder(activeStream, mimeType ? { mimeType } : undefined);
    mediaRecorder.addEventListener("dataavailable", event => { if (event.data.size) recordedChunks.push(event.data); });
    mediaRecorder.addEventListener("stop", () => {
      recordingBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recordingUrl = URL.createObjectURL(recordingBlob);
      $("recording-playback").src = recordingUrl;
      $("recording-playback").hidden = false;
      $("submit-test").disabled = false;
      $("recording-note").textContent = "Recording ready. Listen to it before submitting.";
      $("record-status").textContent = "Recording ready on this device";
      $("record-icon").textContent = "✓";
      activeStream?.getTracks().forEach(track => track.stop()); activeStream = null;
    });
    mediaRecorder.start();
    recordingStartedAt = Date.now(); elapsedSeconds = 0;
    $("record-button").disabled = true; $("stop-button").disabled = false;
    $("record-status").textContent = "Recording…"; $("record-icon").textContent = "🔴";
    timerInterval = setInterval(updateTimer, 1000); updateTimer();
  } catch (error) {
    showToast(error.name === "NotAllowedError" ? "Microphone permission was denied. Allow microphone access and try again." : "Could not start microphone recording.");
  }
}
function updateTimer() {
  elapsedSeconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
  $("record-timer").textContent = `${String(Math.floor(elapsedSeconds / 60)).padStart(2,"0")}:${String(elapsedSeconds % 60).padStart(2,"0")}`;
}
function stopRecording() {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop(); clearInterval(timerInterval);
    $("record-button").disabled = false; $("stop-button").disabled = true;
  }
}
function resetRecorder() {
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  activeStream?.getTracks().forEach(track => track.stop()); activeStream = null;
  clearInterval(timerInterval);
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  mediaRecorder = null; recordedChunks = []; recordingBlob = null; recordingUrl = null; elapsedSeconds = 0;
  $("record-timer").textContent = "00:00"; $("record-status").textContent = "Not recording"; $("record-icon").textContent = "🎙";
  $("record-button").disabled = false; $("stop-button").disabled = true; $("submit-test").disabled = true;
  $("recording-playback").hidden = true; $("recording-playback").removeAttribute("src");
}

$("submit-test").addEventListener("click", async () => {
  if (!recordingBlob || !selectedSection || !currentUser || sectionVerses.length !== 10) return;
  const attempt = {
    id: crypto.randomUUID?.() || String(Date.now()), email: currentUser.email,
    section: selectedSection.label, startVerse: selectedSection.start, endVerse: selectedSection.end,
    duration: elapsedSeconds, createdAt: Date.now(),
    score: null, maxScore: 100, percentage: null, grade: null, ratings: [],
    status: "Submitted · pending self-grade"
  };
  const tests = readStore(STORAGE_TESTS, []); tests.push(attempt); writeStore(STORAGE_TESTS, tests);
  try { await saveAttemptRecording(attempt.id, recordingBlob); }
  catch { showToast("Attempt saved, but this browser could not keep the audio file. Download it before leaving this page."); }
  currentAttempt = attempt;
  $("result-range").textContent = selectedSection.label;
  $("result-date").textContent = new Date(attempt.createdAt).toLocaleString();
  $("result-duration").textContent = `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
  renderReviewVerses();
  setView("result");
});

const VERSE_POINTS = Object.freeze({
  accurate: 10,
  minor: 5,
  missed: 0
});

function computeScoreFromRatings(ratings) {
  const score = ratings.reduce((total, rating) => total + (rating ? VERSE_POINTS[rating] : 0), 0);
  const maxScore = ratings.length * 10;
  const percentage = maxScore ? Math.round((score / maxScore) * 100) : 0;
  let grade = "Needs practice";
  if (percentage >= 90) grade = "Excellent";
  else if (percentage >= 70) grade = "Good";
  else if (percentage >= 50) grade = "Fair";
  return { score, maxScore, percentage, grade };
}

function updateGradingSummaryUI() {
  const completed = verseRatings.filter(rating => rating !== null).length;
  const result = computeScoreFromRatings(verseRatings);
  const scoreText = $("live-score-text");
  const gradeBadge = $("live-grade-badge");
  const saveButton = $("save-grade-button");
  if (scoreText) scoreText.textContent = `Score: ${result.score} / ${result.maxScore} (${result.percentage}%)`;
  if (gradeBadge) gradeBadge.textContent = completed === 10 ? result.grade : `${completed}/10 graded`;
  if (saveButton) saveButton.disabled = completed !== 10;
}

function renderReviewVerses() {
  verseRatings = Array(10).fill(null);
  $("review-verses").innerHTML = sectionVerses.map((verse, index) => `
    <div class="review-verse" data-verse-index="${index}">
      <span>${selectedSection.start + index}</span>
      <p lang="ar" dir="rtl">${escapeHtml(verse.text_uthmani)}</p>
      <div class="verse-grade-actions" role="group" aria-label="Grade verse ${selectedSection.start + index}">
        <button type="button" class="btn btn-small" data-grade-index="${index}" data-rating="accurate" aria-pressed="false">Accurate · 10</button>
        <button type="button" class="btn btn-small" data-grade-index="${index}" data-rating="minor" aria-pressed="false">Minor mistake · 5</button>
        <button type="button" class="btn btn-small" data-grade-index="${index}" data-rating="missed" aria-pressed="false">Missed · 0</button>
        <button type="button" class="text-button" data-play-verse="${index}">Play verse</button>
      </div>
    </div>`).join("");

  let summary = $("grading-summary");
  if (!summary) {
    summary = document.createElement("div");
    summary.id = "grading-summary";
    summary.className = "grading-summary";
    summary.innerHTML = `
      <div>
        <strong id="live-score-text">Score: 0 / 100 (0%)</strong>
        <span id="live-grade-badge" class="history-status">0/10 graded</span>
      </div>
      <button type="button" class="btn btn-gold btn-small" id="save-grade-button" disabled>Save Grade</button>`;
    $("review-verses").insertAdjacentElement("afterend", summary);
  }
  updateGradingSummaryUI();

  referenceAudioQueue = Array.from({ length: 10 }, (_, index) => selectedSection.start + index);
  referenceAudioIndex = 0;
  $("reference-track-label").textContent = `Ready · Verses ${selectedSection.start}–${selectedSection.end}`;
}

// Event delegation supports the verse cards generated above.
$("review-verses").addEventListener("click", event => {
  const gradeButton = event.target.closest("[data-grade-index]");
  if (gradeButton) {
    const index = Number(gradeButton.dataset.gradeIndex);
    const rating = gradeButton.dataset.rating;
    if (!Number.isInteger(index) || index < 0 || index >= 10 || !Object.hasOwn(VERSE_POINTS, rating)) return;
    verseRatings[index] = rating;
    const card = gradeButton.closest(".review-verse");
    card.querySelectorAll("[data-grade-index]").forEach(button => {
      const active = button === gradeButton;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    updateGradingSummaryUI();
    return;
  }

  const playButton = event.target.closest("[data-play-verse]");
  if (playButton) playReferenceTrack(Number(playButton.dataset.playVerse));
});

document.addEventListener("click", event => {
  const saveButton = event.target.closest("#save-grade-button");
  if (!saveButton) return;
  if (!currentAttempt || verseRatings.length !== 10 || verseRatings.some(rating => rating === null)) {
    showToast("Please grade all 10 verses before saving.");
    return;
  }

  const result = computeScoreFromRatings(verseRatings);
  const tests = readStore(STORAGE_TESTS, []);
  const attemptIndex = tests.findIndex(test => test.id === currentAttempt.id);
  if (attemptIndex < 0) {
    showToast("Could not find this test attempt. Please refresh and try again.");
    return;
  }

  tests[attemptIndex] = {
    ...tests[attemptIndex],
    ...result,
    ratings: [...verseRatings],
    status: "Graded"
  };
  writeStore(STORAGE_TESTS, tests);
  currentAttempt = tests[attemptIndex];
  saveButton.disabled = true;
  saveButton.textContent = "Grade Saved";
  showToast(`Grade saved: ${result.score}/100 · ${result.grade}`);
  renderDashboard();
  renderHistory();
});
function stopReferenceAudio() {
  const audio = $("reference-audio");
  if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
  referenceAudioQueue = []; referenceAudioIndex = 0;
}
function playReferenceTrack(index = 0) {
  if (!referenceAudioQueue.length) return;
  referenceAudioIndex = Math.max(0, Math.min(index, referenceAudioQueue.length - 1));
  const verse = referenceAudioQueue[referenceAudioIndex];
  const audio = $("reference-audio");
  audio.src = audioUrl(verse);
  $("reference-track-label").textContent = `Playing verse ${verse} of 30 · ${referenceAudioIndex + 1}/10`;
  audio.play().catch(() => showToast("Reference audio could not play. Check your internet connection."));
}

$("play-full-section").addEventListener("click", () => playReferenceTrack(0));
$("stop-full-section").addEventListener("click", () => {
  $("reference-audio").pause(); $("reference-track-label").textContent = "Playback paused";
});
$("reference-audio").addEventListener("ended", () => {
  if (referenceAudioIndex < referenceAudioQueue.length - 1) playReferenceTrack(referenceAudioIndex + 1);
  else $("reference-track-label").textContent = "Complete section finished";
});
$("download-recording").addEventListener("click", () => {
  if (!recordingBlob) return showToast("This recording is no longer available in this page session.");
  const url = URL.createObjectURL(recordingBlob);
  const link = document.createElement("a");
  link.href = url; link.download = `surah-al-mulk-${selectedSection.start}-${selectedSection.end}-${Date.now()}.webm`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
});

document.addEventListener("click", async event => {
  const action = event.target.closest("[data-recording-action]");
  if (!action) return;
  const id = action.dataset.attemptId;
  try {
    const blob = await getAttemptRecording(id);
    if (!blob) return showToast("This recording is not stored in this browser.");
    const url = URL.createObjectURL(blob);
    if (action.dataset.recordingAction === "download") {
      const link = document.createElement("a"); link.href = url; link.download = `surah-al-mulk-attempt-${id}.webm`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      const row = action.closest(".history-item");
      const player = row.querySelector(".history-audio");
      if (player.dataset.objectUrl) URL.revokeObjectURL(player.dataset.objectUrl);
      player.dataset.objectUrl = url; player.src = url; player.hidden = false; player.play();
    }
  } catch { showToast("Could not open the saved recording in this browser."); }
});

function restoreSession() {
  const email = sessionStorage.getItem(STORAGE_SESSION) || sessionStorage.getItem("almulk_demo_session");
  if (!email) return;
  const user = readStore(STORAGE_USERS, readStore("almulk_demo_users", [])).find(item => item.email === email);
  if (user) currentUser = { name: user.name, email: user.email };
}
restoreSession(); refreshHeader();
