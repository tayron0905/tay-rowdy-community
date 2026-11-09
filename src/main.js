import { createClient } from '@supabase/supabase-js';
import { config, isConfigured } from './config.js';
import './style.css';
import './community.css';

const app = document.querySelector('#app');
const clientKey = 'tayrowdy-community-client';
const clientId = getClientId();
let supabase = null;
let channel = null;
let activeView = 'home';
let currentUser = null;
let isAdmin = false;
let posts = [];
let questions = [];
let announcements = [];
let comments = [];
let likes = [];
let busy = false;

function getClientId() {
  let value = localStorage.getItem(clientKey);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(clientKey, value);
  }
  return value;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function relativeDate(date) {
  const ms = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (minutes < 1440) return `vor ${Math.floor(minutes / 60)} Std.`;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(date));
}

function toast(message, type = 'success') {
  const region = document.querySelector('#toasts');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.textContent = message;
  region.append(item);
  window.setTimeout(() => item.remove(), 4200);
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('button[type="submit"]').forEach((button) => {
    button.disabled = value;
  });
}

function renderShell() {
  app.innerHTML = `
    <header class="topbar"><a class="brand" href="#home" data-view="home"><span class="brand-mark">TR</span><span>TAY ROWDY <small>COMMUNITY</small></span></a>
      <button class="menu-toggle" aria-label="Navigation öffnen" aria-expanded="false"><i></i><i></i></button>
      <nav class="nav-links" aria-label="Hauptnavigation">
        <a href="#home" data-view="home">Start</a><a href="#community" data-view="community">Community</a><a href="#fragen" data-view="fragen">Frag mich!</a>
      </nav>
      <a class="nav-cta" href="${escapeHtml(config.tiktokUrl)}" target="_blank" rel="noopener noreferrer">TikTok ansehen <span>↗</span></a>
    </header>
    <main>
      <section class="view" id="view-home"></section>
      <section class="view hidden" id="view-community"></section>
      <section class="view hidden" id="view-fragen"></section>
      <section class="view hidden" id="view-recht"></section>
      <section class="view hidden" id="view-admin"></section>
    </main>
    <footer class="footer"><a class="brand footer-brand" href="#home" data-view="home"><span class="brand-mark">TR</span><span>TAY ROWDY <small>COMMUNITY</small></span></a><p>Ein guter Vibe entsteht, wenn alle respektvoll miteinander umgehen.</p><div class="footer-links"><a href="#regeln" data-view="regeln">Community-Regeln</a><a href="#impressum" data-view="impressum">Impressum</a><a href="#datenschutz" data-view="datenschutz">Datenschutz</a><a href="#admin" data-view="admin">Admin</a></div><small class="copyright">© ${new Date().getFullYear()} Tay Rowdy Community</small></footer>
    <div id="toasts" class="toast-region" aria-live="polite"></div>`;
  document.querySelector('.menu-toggle').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    document.querySelector('.nav-links').classList.toggle('nav-open', !expanded);
  });
  document.addEventListener('click', onNavigation);
}

function onNavigation(event) {
  const link = event.target.closest('[data-view]');
  if (!link) return;
  event.preventDefault();
  navigate(link.dataset.view);
  document.querySelector('.nav-links')?.classList.remove('nav-open');
  document.querySelector('.menu-toggle')?.setAttribute('aria-expanded', 'false');
}

function navigate(view) {
  const id = ['home', 'community', 'fragen', 'recht', 'admin'].includes(view) ? view : ['regeln', 'impressum', 'datenschutz'].includes(view) ? 'recht' : 'home';
  const leavingAdmin = activeView === 'admin' && id !== 'admin';
  activeView = id;
  if (leavingAdmin && currentUser && supabase) {
    currentUser = null;
    isAdmin = false;
    supabase.auth.signOut({ scope: 'local' }).then(({ error }) => {
      if (error) toast('Automatische Abmeldung fehlgeschlagen. Bitte melde dich manuell ab.', 'error');
    });
  }
  document.querySelectorAll('.view').forEach((element) => element.classList.add('hidden'));
  document.querySelector(`#view-${id}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-links a').forEach((link) => link.classList.toggle('active', link.dataset.view === view));
  if (id === 'home') renderHome();
  if (id === 'community') renderCommunity();
  if (id === 'fragen') renderQuestions();
  if (id === 'admin') renderAdmin();
  if (id === 'recht') renderLegal(view);
  history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHome() {
  const target = document.querySelector('#view-home');
  target.innerHTML = `
    <section class="hero wrap"><div class="hero-copy"><div class="eyebrow"><span class="status-dot"></span> TIKTOK COMMUNITY</div><h1>Deine Community.<br /><em>Deine Stimme.</em></h1><p class="hero-lede">Hier trifft sich die Community von @${escapeHtml(config.tiktokHandle)}. Schreib, was dich bewegt, teile deine Gedanken und komm mit anderen ins Gespräch.</p><div class="hero-actions"><a class="button button-primary" href="#community" data-view="community">Zur Community <span>↗</span></a><a class="button button-quiet" href="${escapeHtml(config.tiktokUrl)}" target="_blank" rel="noopener noreferrer">TikTok-Profil ansehen <span>↗</span></a></div><div class="hero-proof"><div class="avatar-stack"><span>T</span><span>R</span><span>✦</span></div><span>Ein Platz für <strong>alle aus der Community</strong></span></div></div>
    <div class="hero-art"><div class="art-glow"></div><article class="community-preview"><div class="preview-top"><span class="tiktok-mark">♪</span><span>TAY ROWDY COMMUNITY</span><span class="preview-live"><i></i> LIVE</span></div><div class="preview-profile"><div class="preview-avatar">TR</div><div><strong>Tay Rowdy</strong><span>@${escapeHtml(config.tiktokHandle)}</span></div><span class="profile-check">✦</span></div><div class="preview-rule"></div><div class="preview-copy"><small>DEIN PLATZ IST FREI</small><p>Was geht dir<br /><em>durch den Kopf?</em></p><span>Schreib mit der Community.</span></div><div class="preview-bottom"><span>✎ Beiträge</span><span>♡ Antworten</span><span>↗ Austausch</span></div></article><div class="float-note note-top"><span>✳</span> Echte Gespräche</div><div class="float-note note-bottom"><span>♡</span> Ein guter Vibe</div></div></section>
    <section class="announcement-section wrap"><div class="section-heading"><div><div class="eyebrow">DAS GIBT'S NEUES</div><h2>Community-<em>Updates</em></h2></div><span class="heading-mark">✳</span></div><div class="announcement-list" id="announcement-list"></div></section>
    <section class="home-cta wrap"><div><div class="eyebrow">DEIN PLATZ IST FREI</div><h2>Mach mit. <em>Sei dabei.</em></h2><p>Schreib deinen ersten Beitrag und lern die Community kennen.</p></div><a class="button button-primary" href="#community" data-view="community">Jetzt mitmachen <span>↗</span></a></section>`;
  renderAnnouncements();
}

function renderAnnouncements() {
  const list = document.querySelector('#announcement-list');
  if (!list) return;
  if (!announcements.length) {
    list.innerHTML = '<div class="empty-state compact"><span class="empty-icon">✳</span><p>Hier erscheinen Neuigkeiten und Ankündigungen aus der Community.</p></div>';
    return;
  }
  list.innerHTML = announcements.slice(0, 3).map((item, index) => `<article class="announcement-card"><div class="announcement-number">0${index + 1}</div><div class="announcement-content"><div class="announcement-meta"><span class="eyebrow">ANKÜNDIGUNG</span><span>${relativeDate(item.created_at)}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></div></article>`).join('');
}

function renderCommunity() {
  const target = document.querySelector('#view-community');
  target.innerHTML = `<section class="page-heading wrap"><div class="eyebrow"><span class="status-dot"></span> COMMUNITY BOARD</div><h1>Hier bist <em>du dran.</em></h1><p>Teile, was dich beschäftigt. Frag die Community. Bleib respektvoll.</p></section>
    <section class="community-layout wrap"><div class="feed-column"><form class="compose-card" id="post-form"><div class="compose-top"><div class="compose-avatar">${initialFor(isAdmin ? 'Tayron' : getSavedName() || 'Du')}</div><div><strong>Was geht dir durch den Kopf?</strong><span>${isAdmin ? 'Du schreibst als Website-Inhaber.' : 'Dein Beitrag ist öffentlich sichtbar.'}</span></div></div><label class="sr-only" for="post-name">Dein Benutzername</label><input id="post-name" name="username" maxlength="24" minlength="2" placeholder="Dein Name in der Community" value="${escapeHtml(isAdmin ? 'Tayron' : getSavedName())}" ${isAdmin ? 'readonly' : ''} required /><label class="sr-only" for="post-content">Dein Beitrag</label><textarea id="post-content" name="content" maxlength="1000" rows="4" placeholder="Schreib der Community etwas …" required></textarea><div class="compose-bottom"><span class="char-count" data-count="post-content">0 / 1000</span><button class="button button-primary" type="submit">Beitrag teilen <span>↗</span></button></div></form><div class="feed-toolbar"><h2>Community-Feed</h2><span class="feed-live"><i></i> LIVE</span></div><div id="post-feed" class="post-feed">${loading()}</div></div><aside class="sidebar"><div class="side-card side-accent"><div class="side-symbol">✳</div><div class="eyebrow">GUTER VIBE ONLY</div><h3>Wir machen den Raum gemeinsam.</h3><p>Sei freundlich, bleib fair und gib allen die Chance, sich wohlzufühlen.</p><a href="#regeln" data-view="regeln" class="text-link">Alle Regeln ansehen <span>→</span></a></div><div class="side-card"><div class="eyebrow">FRAGE AN TAY?</div><h3>Immer her damit.</h3><p>Im Fragenbereich kannst du direkt eine Frage stellen – auch anonym.</p><a class="button button-outline" href="#fragen" data-view="fragen">Frag mich! <span>↗</span></a></div><div class="side-card"><div class="eyebrow">AUCH AUF TIKTOK</div><h3>@${escapeHtml(config.tiktokHandle)}</h3><a class="text-link" href="${escapeHtml(config.tiktokUrl)}" target="_blank" rel="noopener noreferrer">Zum Profil <span>↗</span></a></div></aside></section>`;
  attachFormCounters();
  document.querySelector('#post-form').addEventListener('submit', submitPost);
  loadPosts();
}

function initialFor(name) { return escapeHtml((name.trim()[0] || 'T').toUpperCase()); }
function getSavedName() { return localStorage.getItem('tayrowdy-community-name') || ''; }
function loading() { return '<div class="loading-state"><span class="loader"></span><span>Beiträge werden geladen</span></div>'; }

async function loadPosts() {
  const feed = document.querySelector('#post-feed');
  if (!feed) return;
  if (!supabase) { feed.innerHTML = setupMessage(); return; }
  const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(60);
  if (error) { feed.innerHTML = errorMessage(error.message); return; }
  posts = data || [];
  if (posts.length) {
    const ids = posts.map((post) => post.id);
    const [commentResult, likeResult] = await Promise.all([
      supabase.from('comments').select('*').in('post_id', ids).order('created_at'),
      supabase.from('likes').select('post_id,client_id').in('post_id', ids),
    ]);
    comments = commentResult.data || [];
    likes = likeResult.data || [];
  } else { comments = []; likes = []; }
  renderPostFeed();
}

function renderPostFeed() {
  const feed = document.querySelector('#post-feed');
  if (!feed) return;
  if (!posts.length) { feed.innerHTML = '<div class="empty-state"><span class="empty-icon">✳</span><h3>Hier ist noch Platz für dich.</h3><p>Schreib den ersten Beitrag und bring die Unterhaltung ins Rollen.</p></div>'; return; }
  feed.innerHTML = posts.map((post) => {
    const replies = comments.filter((item) => item.post_id === post.id);
    const postLikes = likes.filter((item) => item.post_id === post.id);
    const liked = postLikes.some((item) => item.client_id === clientId);
    return `<article class="post-card" data-post="${post.id}"><div class="post-head"><div class="post-avatar">${initialFor(post.username)}</div><div class="post-author"><strong>${escapeHtml(post.username)}${post.is_owner ? ' <span class="owner-badge">WEBSITE-INHABER</span>' : ''}</strong><span>${relativeDate(post.created_at)}</span></div>${currentUser ? `<button class="icon-button delete-post" data-id="${post.id}" aria-label="Beitrag moderieren">···</button>` : ''}</div><p class="post-body">${escapeHtml(post.content)}</p><div class="post-actions"><button class="reaction-button ${liked ? 'is-liked' : ''}" data-like="${post.id}" aria-label="Beitrag liken"><span>${liked ? '♥' : '♡'}</span> ${postLikes.length} Likes</button><button class="reaction-button" data-comments="${post.id}">↩ ${replies.length} Antworten</button></div><div class="comment-list">${replies.map((reply) => `<div class="comment"><span class="comment-avatar">${initialFor(reply.username)}</span><p><strong>${escapeHtml(reply.username)}${reply.is_owner ? ' <span class="owner-badge">INHABER</span>' : ''}</strong> ${escapeHtml(reply.content)}<small>${relativeDate(reply.created_at)}</small></p>${currentUser ? `<button class="delete-comment" data-id="${reply.id}" aria-label="Antwort löschen">×</button>` : ''}</div>`).join('')}</div><form class="reply-form" data-reply="${post.id}"><input name="username" maxlength="24" minlength="2" value="${escapeHtml(isAdmin ? 'Tayron' : getSavedName())}" placeholder="Dein Name" aria-label="Dein Name" ${isAdmin ? 'readonly' : ''} required /><input name="content" maxlength="500" placeholder="Antworte auf diesen Beitrag …" aria-label="Deine Antwort" required /><button aria-label="Antwort senden" type="submit">↑</button></form></article>`;
  }).join('');
  feed.querySelectorAll('[data-like]').forEach((button) => button.addEventListener('click', () => addLike(button.dataset.like)));
  feed.querySelectorAll('[data-reply]').forEach((form) => form.addEventListener('submit', submitComment));
  feed.querySelectorAll('[data-comments]').forEach((button) => button.addEventListener('click', () => document.querySelector(`[data-reply="${button.dataset.comments}"] input[name="content"]`)?.focus()));
  feed.querySelectorAll('.delete-post').forEach((button) => button.addEventListener('click', () => deleteRow('posts', button.dataset.id, 'Beitrag')));
  feed.querySelectorAll('.delete-comment').forEach((button) => button.addEventListener('click', () => deleteRow('comments', button.dataset.id, 'Antwort')));
}

async function submitPost(event) {
  event.preventDefault();
  if (busy) return;
  if (!supabase) return toast('Bitte zuerst Supabase in src/config.js einrichten.', 'error');
  const form = event.currentTarget;
  const data = new FormData(form);
  const username = isAdmin ? 'Tayron' : String(data.get('username') || '').trim();
  const content = String(data.get('content') || '').trim();
  if (username.length < 2 || !content) return toast('Bitte gib einen Namen und einen Beitrag ein.', 'error');
  setBusy(true);
  const { error } = await supabase.from('posts').insert({ username, content, client_id: clientId });
  setBusy(false);
  if (error) return toast(userError(error), 'error');
  localStorage.setItem('tayrowdy-community-name', username);
  form.reset();
  form.querySelector('[name="username"]').value = username;
  updateCounts();
  toast('Dein Beitrag ist jetzt im Feed.');
  await loadPosts();
}

async function submitComment(event) {
  event.preventDefault();
  if (!supabase || busy) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const username = isAdmin ? 'Tayron' : String(data.get('username') || '').trim();
  const content = String(data.get('content') || '').trim();
  if (username.length < 2 || !content) return toast('Bitte gib einen Namen und eine Antwort ein.', 'error');
  setBusy(true);
  const { error } = await supabase.from('comments').insert({ post_id: form.dataset.reply, username, content, client_id: clientId });
  setBusy(false);
  if (error) return toast(userError(error), 'error');
  localStorage.setItem('tayrowdy-community-name', username);
  toast('Deine Antwort wurde veröffentlicht.');
  await loadPosts();
}

async function addLike(postId) {
  if (!supabase) return toast('Bitte zuerst Supabase einrichten.', 'error');
  const existing = likes.some((item) => item.post_id === postId && item.client_id === clientId);
  if (existing) return toast('Du hast diesen Beitrag schon gelikt.');
  const { error } = await supabase.from('likes').insert({ post_id: postId, client_id: clientId });
  if (error && error.code !== '23505') return toast(userError(error), 'error');
  await loadPosts();
}

async function deleteRow(table, id, label) {
  if (!supabase || !currentUser) return;
  if (!window.confirm(`${label} wirklich löschen?`)) return;
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error) return toast(userError(error), 'error');
  if (!data?.length) return toast(`${label} wurde nicht gelöscht. Prüfe, ob dein Konto in Supabase als Admin eingetragen ist.`, 'error');
  toast(`${label} wurde entfernt.`);
  if (table === 'posts' || table === 'comments') await loadPosts();
  if (table === 'questions') { await loadQuestions(); await loadAdminQuestions(); }
  if (table === 'announcements') await loadAnnouncements();
}

function renderQuestions() {
  const target = document.querySelector('#view-fragen');
  target.innerHTML = `<section class="page-heading wrap"><div class="eyebrow"><span class="status-dot"></span> DIREKT AN TAY</div><h1>Frag <em>mich!</em></h1><p>Du hast eine Frage? Stell sie hier. Wenn du möchtest, auch ganz anonym.</p></section><section class="questions-layout wrap"><div class="question-form-wrap"><form class="question-form" id="question-form"><div class="eyebrow">DEINE FRAGE</div><label class="anon-toggle"><input type="checkbox" name="anonymous" id="anonymous-toggle" /><span class="toggle-ui"></span><span>Anonym fragen</span></label><label for="question-name" class="field-label">Dein Name <span>(optional)</span></label><input id="question-name" name="username" maxlength="24" placeholder="Wie sollen wir dich nennen?" value="${escapeHtml(getSavedName())}" /><label for="question-text" class="field-label">Deine Frage</label><textarea id="question-text" name="question" maxlength="500" rows="5" placeholder="Was wolltest du Tay schon immer fragen?" required></textarea><div class="compose-bottom"><span class="char-count" data-count="question-text">0 / 500</span><button class="button button-primary" type="submit">Frage senden <span>↗</span></button></div><p class="form-note">Fragen und Antworten sind öffentlich sichtbar.</p></form></div><div class="questions-column"><div class="feed-toolbar"><h2>Fragen & Antworten</h2><span class="feed-live"><i></i> NEUESTE ZUERST</span></div><div id="question-list" class="question-list">${loading()}</div></div></section>`;
  attachFormCounters();
  const anonymous = document.querySelector('#anonymous-toggle');
  anonymous.addEventListener('change', () => { document.querySelector('#question-name').disabled = anonymous.checked; });
  document.querySelector('#question-form').addEventListener('submit', submitQuestion);
  loadQuestions();
}

async function loadQuestions() {
  const list = document.querySelector('#question-list');
  if (!list) return;
  if (!supabase) { list.innerHTML = setupMessage(); return; }
  const { data, error } = await supabase.from('questions').select('*').not('answered_at', 'is', null).order('created_at', { ascending: false }).limit(80);
  if (error) { list.innerHTML = errorMessage(error.message); return; }
  questions = data || [];
  renderQuestionList();
}

function renderQuestionList() {
  const list = document.querySelector('#question-list');
  if (!list) return;
  if (!questions.length) { list.innerHTML = '<div class="empty-state"><span class="empty-icon">?</span><h3>Stell die erste Frage.</h3><p>Die Antworten erscheinen hier für alle.</p></div>'; return; }
  list.innerHTML = questions.map((item) => `<article class="question-card"><div class="question-meta"><div class="questioner"><span class="question-avatar">${item.username ? initialFor(item.username) : '?'}</span><strong>${item.username ? escapeHtml(item.username) : 'Anonym'}</strong></div><time>${relativeDate(item.created_at)}</time></div><p class="question-text">${escapeHtml(item.question)}</p>${item.answer ? `<div class="answer-box"><div class="answer-label"><span class="answer-avatar">TR</span><strong>Tay hat geantwortet</strong><span class="answer-date">${relativeDate(item.answered_at)}</span></div><p>${escapeHtml(item.answer)}</p></div>` : `<div class="waiting-answer">${currentUser ? `<button class="text-link admin-answer" data-id="${item.id}">Antwort schreiben <span>→</span></button>` : '<span>✳</span> Vielleicht kommt die Antwort schon bald …'}</div>`}${currentUser ? `<button class="delete-question" data-id="${item.id}">Frage entfernen</button>` : ''}</article>`).join('');
  list.querySelectorAll('.admin-answer').forEach((button) => button.addEventListener('click', () => answerQuestion(button.dataset.id)));
  list.querySelectorAll('.delete-question').forEach((button) => button.addEventListener('click', () => deleteRow('questions', button.dataset.id, 'Frage')));
}

async function submitQuestion(event) {
  event.preventDefault();
  if (busy) return;
  if (!supabase) return toast('Bitte zuerst Supabase einrichten.', 'error');
  const form = event.currentTarget;
  const data = new FormData(form);
  const anonymous = data.get('anonymous') === 'on';
  const username = anonymous ? null : String(data.get('username') || '').trim() || null;
  const question = String(data.get('question') || '').trim();
  if (!question) return toast('Bitte gib deine Frage ein.', 'error');
  if (!anonymous && username && username.length < 2) return toast('Der Name muss mindestens 2 Zeichen lang sein.', 'error');
  setBusy(true);
  const { error } = await supabase.from('questions').insert({ username, question, client_id: clientId });
  setBusy(false);
  if (error) return toast(userError(error), 'error');
  if (username) localStorage.setItem('tayrowdy-community-name', username);
  form.reset();
  updateCounts();
  toast('Deine Frage wurde gesendet.');
  await loadQuestions();
}

async function answerQuestion(id) {
  const answer = window.prompt('Deine Antwort:');
  if (!answer?.trim()) return;
  const { error } = await supabase.from('questions').update({ answer: answer.trim(), answered_at: new Date().toISOString() }).eq('id', id);
  if (error) return toast(userError(error), 'error');
  toast('Deine Antwort ist veröffentlicht.');
  await loadQuestions();
  await loadAdminQuestions();
}

function renderAdmin() {
  const target = document.querySelector('#view-admin');
  if (currentUser) {
    target.innerHTML = `<section class="page-heading wrap"><div class="eyebrow"><span class="status-dot"></span> ADMINISTRATION</div><h1>Dein <em>Kontrollraum.</em></h1><p>Angemeldet als ${escapeHtml(currentUser.email || 'Administrator')} · Eigentümer <button class="text-link" id="logout-button">Abmelden <span>↗</span></button></p></section><section class="admin-layout wrap"><div class="admin-card admin-inbox"><div class="eyebrow">FRAGEN AN DICH</div><h2>Dein Posteingang</h2><p>Nur du kannst unbeantwortete Fragen sehen. Antworten werden danach öffentlich angezeigt.</p><div id="admin-question-list" class="question-list">${loading()}</div></div><form class="admin-card" id="announcement-form"><div class="eyebrow">NEUE ANKÜNDIGUNG</div><label class="field-label" for="announcement-title">Titel</label><input id="announcement-title" name="title" maxlength="100" required /><label class="field-label" for="announcement-body">Text</label><textarea id="announcement-body" name="body" maxlength="1000" rows="4" required></textarea><button class="button button-primary" type="submit">Veröffentlichen <span>↗</span></button></form><div class="admin-card"><div class="eyebrow">ÜBERSICHT</div><h2>Moderation</h2><p>Löschen kannst du Beiträge und Antworten direkt im Community-Feed.</p><button class="button button-outline" data-view="community">Zum Feed <span>↗</span></button></div><div class="admin-card"><div class="eyebrow">ANKÜNDIGUNGEN</div><div id="admin-announcements"></div></div></section>`;
    document.querySelector('#logout-button').addEventListener('click', signOut);
    document.querySelector('#announcement-form').addEventListener('submit', submitAnnouncement);
    renderAdminAnnouncements();
    loadAdminQuestions();
    return;
  }
  target.innerHTML = `<section class="page-heading wrap"><div class="eyebrow">GESCHÜTZTER BEREICH</div><h1>Admin <em>Login</em></h1><p>Melde dich mit deinem Supabase-Administrator-Konto an.</p></section><section class="login-wrap wrap"><form class="admin-card login-card" id="login-form"><label class="field-label" for="admin-email">E-Mail</label><input id="admin-email" name="email" type="email" autocomplete="username" required /><label class="field-label" for="admin-password">Passwort</label><input id="admin-password" name="password" type="password" autocomplete="current-password" required /><button class="button button-primary" type="submit">Anmelden <span>↗</span></button><p class="form-note">Der Zugriff wird durch Supabase Auth und Datenbankregeln geprüft.</p></form>${!isConfigured ? setupMessage() : ''}</section>`;
  document.querySelector('#login-form').addEventListener('submit', signIn);
}

function renderAdminAnnouncements() {
  const list = document.querySelector('#admin-announcements');
  if (!list) return;
  list.innerHTML = announcements.length ? announcements.map((item) => `<div class="admin-announcement"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div><button class="delete-announcement" data-id="${item.id}" aria-label="Ankündigung löschen">×</button></div>`).join('') : '<p>Noch keine Ankündigungen veröffentlicht.</p>';
  list.querySelectorAll('.delete-announcement').forEach((button) => button.addEventListener('click', () => deleteRow('announcements', button.dataset.id, 'Ankündigung')));
}

async function signIn(event) {
  event.preventDefault();
  if (!supabase || busy) return toast('Supabase muss eingerichtet sein, bevor du dich anmelden kannst.', 'error');
  const data = new FormData(event.currentTarget);
  setBusy(true);
  const { data: result, error } = await supabase.auth.signInWithPassword({ email: data.get('email'), password: data.get('password') });
  setBusy(false);
  if (error) return toast('Anmeldung fehlgeschlagen. Prüfe deine Zugangsdaten.', 'error');
  currentUser = result.user;
  toast('Du bist angemeldet.');
  navigate('admin');
}

async function loadAdminQuestions() {
  const list = document.querySelector('#admin-question-list');
  if (!list || !supabase || !currentUser) return;
  const { data, error } = await supabase.from('questions').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) { list.innerHTML = errorMessage(error.message); return; }
  if (!data?.length) { list.innerHTML = '<div class="empty-state"><p>Dein Posteingang ist leer.</p></div>'; return; }
  list.innerHTML = data.map((item) => `<article class="question-card"><div class="question-meta"><strong>${item.username ? escapeHtml(item.username) : 'Anonym'}</strong><time>${relativeDate(item.created_at)}</time></div><p class="question-text">${escapeHtml(item.question)}</p>${item.answer ? `<div class="answer-box"><strong>Deine Antwort</strong><p>${escapeHtml(item.answer)}</p></div>` : `<button class="button button-primary admin-answer" data-id="${item.id}">Antwort schreiben</button>`}<button class="delete-question" data-id="${item.id}">Frage löschen</button></article>`).join('');
  list.querySelectorAll('.admin-answer').forEach((button) => button.addEventListener('click', () => answerQuestion(button.dataset.id)));
  list.querySelectorAll('.delete-question').forEach((button) => button.addEventListener('click', () => deleteRow('questions', button.dataset.id, 'Frage')));
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) return toast(userError(error), 'error');
  currentUser = null;
  toast('Du bist abgemeldet.');
  navigate('home');
}

async function submitAnnouncement(event) {
  event.preventDefault();
  if (busy) return;
  const data = new FormData(event.currentTarget);
  setBusy(true);
  const { error } = await supabase.from('announcements').insert({ title: String(data.get('title')).trim(), body: String(data.get('body')).trim() });
  setBusy(false);
  if (error) return toast(userError(error), 'error');
  event.currentTarget.reset();
  toast('Ankündigung veröffentlicht.');
  await loadAnnouncements();
}

async function loadAnnouncements() {
  if (!supabase) return;
  const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20);
  if (error) return console.error('Ankündigungen konnten nicht geladen werden:', error.message);
  announcements = data || [];
  renderAnnouncements();
  renderAdminAnnouncements();
}

function renderLegal(view) {
  const target = document.querySelector('#view-recht');
  const pages = {
    regeln: { kicker: 'GEMEINSAM GUT', title: 'Community-<em>Regeln</em>', body: `<div class="legal-card"><h2>So bleibt es ein guter Ort</h2><ol class="rules-list"><li><strong>Sei respektvoll.</strong> Schreib so, wie du selbst angesprochen werden möchtest.</li><li><strong>Keine Beleidigungen oder Diskriminierung.</strong> Hass, Mobbing und persönliche Angriffe haben hier keinen Platz.</li><li><strong>Schütze deine Privatsphäre.</strong> Teile keine privaten Daten von dir oder anderen.</li><li><strong>Kein Spam.</strong> Werbung, wiederholte Nachrichten und irreführende Links werden entfernt.</li><li><strong>Bleib beim Thema.</strong> Lass anderen Raum für ihre Gedanken und Fragen.</li></ol><p>Administratoren können Inhalte entfernen, die gegen diese Regeln verstoßen.</p></div>` },
    impressum: { kicker: 'RECHTLICHES', title: 'Impress<em>um</em>', body: `<div class="legal-card"><p><strong>Bitte vor Veröffentlichung vervollständigen.</strong> Als Betreiber musst du die gesetzlich erforderlichen Anbieterangaben eintragen.</p><h2>Angaben gemäß § 5 DDG</h2><p>[Vollständiger Name]<br />[Ladungsfähige Anschrift]<br />[Postleitzahl und Ort]</p><h2>Kontakt</h2><p>E-Mail: [deine Kontakt-E-Mail]</p><h2>Verantwortlich für den Inhalt</h2><p>[Name und Anschrift, sofern erforderlich]</p></div>` },
    datenschutz: { kicker: 'RECHTLICHES', title: 'Daten<em>schutz</em>', body: `<div class="legal-card"><p><strong>Bitte vor Veröffentlichung prüfen und vervollständigen.</strong> Dieser Entwurf ersetzt keine Prüfung deiner konkreten Verarbeitung.</p><h2>Verantwortlicher</h2><p>[Name und ladungsfähige Anschrift]<br />Kontakt: [E-Mail-Adresse]</p><h2>Welche Daten verarbeitet werden</h2><p>Für Beiträge, Antworten, Likes und Fragen werden die eingegebenen Inhalte, ein Anzeigename (sofern angegeben) und ein zufällig erzeugtes Kennzeichen im Browser gespeichert. Fragen können anonym übermittelt werden. Die Daten werden über Supabase verarbeitet und dort dauerhaft gespeichert, bis sie gelöscht werden.</p><h2>Hosting und technische Dienste</h2><p>Diese Website wird über GitHub Pages bereitgestellt. Community-Daten und Administrator-Anmeldungen werden über Supabase verarbeitet. Ergänze hier die konkreten Anbieter, Speicherorte, Aufbewahrungsfristen, Rechtsgrundlagen und Kontaktwege zur Ausübung deiner Rechte.</p><h2>Schriftarten</h2><p>Die Seite lädt Schriftarten von Google Fonts. Wenn du das vermeiden möchtest, entferne den externen Font-Aufruf und verwende lokale Systemschriftarten.</p><h2>Deine Rechte</h2><p>Betroffene können im Rahmen der gesetzlichen Vorgaben Auskunft, Berichtigung, Löschung oder Einschränkung der Verarbeitung verlangen sowie sich bei einer Datenschutzaufsichtsbehörde beschweren. Kontakt: [E-Mail-Adresse].</p></div>` },
  };
  const page = pages[view] || pages.regeln;
  target.innerHTML = `<section class="page-heading wrap"><div class="eyebrow">${page.kicker}</div><h1>${page.title}</h1></section><section class="legal-wrap wrap">${page.body}</section>`;
}

function attachFormCounters() {
  document.querySelectorAll('[data-count]').forEach((counter) => {
    const input = document.getElementById(counter.dataset.count);
    const update = () => { counter.textContent = `${input.value.length} / ${input.maxLength}`; };
    input.addEventListener('input', update);
    update();
  });
}

function updateCounts() { document.querySelectorAll('[data-count]').forEach((counter) => { const field = document.getElementById(counter.dataset.count); if (field) counter.textContent = `${field.value.length} / ${field.maxLength}`; }); }

function setupMessage() {
  return '<div class="setup-notice"><span>⚙</span><div><strong>Supabase noch nicht verbunden</strong><p>Trage die Projekt-URL und den öffentlichen Schlüssel in <code>src/config.js</code> ein. Danach erscheint der Community-Feed hier.</p></div></div>';
}
function errorMessage(message) { return `<div class="error-notice">Verbindung fehlgeschlagen: ${escapeHtml(message)}<br /><small>Prüfe die Supabase-Einstellungen und die Datenbankregeln.</small></div>`; }
function userError(error) {
  if (error.code === '23505') return 'Das hast du schon gemacht.';
  if (error.message?.includes('Gerade ist viel los')) return 'Gerade ist viel los. Versuch es bitte gleich noch einmal.';
  if (error.message?.includes('Bitte nicht so schnell')) return 'Bitte warte kurz, bevor du den nächsten Beitrag sendest.';
  if (error.code === '42501') return 'Diese Aktion ist nur für Administratoren erlaubt.';
  return error.message || 'Das hat leider nicht geklappt. Bitte versuch es später noch einmal.';
}

async function initialize() {
  renderShell();
  if (isConfigured) {
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user || null;
    if (currentUser) { const { data: adminResult } = await supabase.rpc('is_admin'); isAdmin = adminResult === true; }
    supabase.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session?.user || null;
      isAdmin = false;
      if (currentUser) { const { data: adminResult } = await supabase.rpc('is_admin'); isAdmin = adminResult === true; }
      if (activeView === 'admin') renderAdmin();
      if (activeView === 'community') renderCommunity();
      if (activeView === 'fragen') renderQuestionList();
    });
    await loadAnnouncements();
    subscribeRealtime();
  }
  const view = location.hash.slice(1) || 'home';
  navigate(view);
}

function subscribeRealtime() {
  if (!supabase) return;
  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel('community-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => { if (activeView === 'community') loadPosts(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => { if (activeView === 'community') loadPosts(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => { if (activeView === 'community') loadPosts(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, () => { if (activeView === 'fragen') loadQuestions(); if (activeView === 'admin') loadAdminQuestions(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => loadAnnouncements())
    .subscribe();
}

initialize();
