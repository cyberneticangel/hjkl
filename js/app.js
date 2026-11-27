// app.js — DOM glue: keyboard capture, rendering, lesson navigation, progress.
(function () {
  'use strict';

  const { LESSONS, CHAPTERS, Session } = window.HJKL;
  const screen = document.getElementById('screen');
  const footer = document.getElementById('footer');
  const STORE = 'hjkl:progress:v1';

  const BANNER = String.raw`
 _        _   _      _
| |__    (_) | | __ | |
| '_ \   | | | |/ / | |
| | | |  | | |   <  | |
|_| |_| _/ | |_|\_\ |_|
       |__/`.slice(1);

  const progress = loadProgress();
  let view = 'welcome';          // welcome | lesson | menu | finished
  let menuReturn = 'welcome';
  let menuSel = 0;
  let idx = Math.min(progress.last || 0, LESSONS.length - 1);
  let session = null;
  let showHint = false;
  let echo = [];
  let queued = null;              // navigation requested from inside an ex command

  // ---------- persistence ----------
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(STORE));
      if (p && typeof p === 'object') return { done: p.done || {}, last: p.last || 0 };
    } catch (e) { /* storage unavailable */ }
    return { done: {}, last: 0 };
  }
  function saveProgress() {
    try { localStorage.setItem(STORE, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, '<kbd>$1</kbd>');
  const pad = (n, w) => String(n).padStart(w, ' ');
  const KEY_LABELS = {
    Escape: '<Esc>', Enter: '<CR>', Backspace: '<BS>', Tab: '<Tab>', Delete: '<Del>', ' ': '␣',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  };
  const keyLabel = (k) => KEY_LABELS[k] || k;
  const firstUnsolved = () => {
    const i = LESSONS.findIndex((l) => !(l.id in progress.done));
    return i < 0 ? 0 : i;
  };

  // ---------- navigation ----------
  function startLesson(i) {
    idx = Math.max(0, Math.min(LESSONS.length - 1, i));
    session = new Session(LESSONS[idx], { exHandler });
    view = 'lesson';
    showHint = false;
    echo = [];
    progress.last = idx;
    saveProgress();
    render();
  }
  function nextLesson() {
    if (idx >= LESSONS.length - 1) { view = 'finished'; render(); return; }
    startLesson(idx + 1);
  }
  function openMenu() {
    if (view !== 'menu') menuReturn = view;
    menuSel = idx;
    view = 'menu';
    render();
  }
  function closeMenu() {
    view = menuReturn === 'lesson' && session ? 'lesson' : 'welcome';
    render();
  }
  function resetLesson() {
    if (!session) return;
    session.reset();
    echo = [];
    render();
  }

  // Extra ex commands that only make sense in the tutorial.
  function exHandler(cmd) {
    const [name, arg] = cmd.split(/\s+/);
    switch (name) {
      case 'next': case 'n': queued = nextLesson; return true;
      case 'prev': case 'previous': queued = () => startLesson(idx - 1); return true;
      case 'reset': case 'restart': queued = resetLesson; return true;
      case 'lessons': case 'ls': case 'menu': queued = openMenu; return true;
      case 'lesson': {
        const n = parseInt(arg, 10);
        if (n >= 1 && n <= LESSONS.length) { queued = () => startLesson(n - 1); return true; }
        return false;
      }
      case 'hint': case 'help': case 'h':
        showHint = true;
        return true;
    }
    return false;
  }

  // ---------- keyboard ----------
  function toVimKey(e) {
    if (e.metaKey || e.altKey) return null;
    // On some layouts (for example German and US International), ^ is a
    // dead key and KeyboardEvent.key is "Dead" instead of the typed symbol.
    // Use its physical position only for the common caret keys.
    if (e.key === 'Dead' && (e.code === 'Backquote' || (e.code === 'Digit6' && e.shiftKey))) return '^';
    if (e.ctrlKey) {
      const k = e.key.toLowerCase();
      if (k === '[' || k === 'c') return 'Escape';
      if (k === 'r') return '<C-r>';
      return null;
    }
    if (e.key.length === 1) return e.key;
    if (['Escape', 'Enter', 'Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return e.key;
    return null;
  }

  window.addEventListener('keydown', (e) => {
    if (e.isComposing && e.key !== 'Dead') return;
    const onButton = e.target instanceof HTMLElement && e.target.closest('button');
    if (onButton && (e.key === 'Enter' || e.key === ' ')) return;
    const k = toVimKey(e);
    if (!k) return;
    e.preventDefault();
    handleKey(k);
  });

  function handleKey(k) {
    if (view === 'welcome') {
      if (k === 'l' || k === ':') openMenu();
      else {
        const last = LESSONS[progress.last];
        startLesson(last && !(last.id in progress.done) ? progress.last : firstUnsolved());
      }
      return;
    }
    if (view === 'menu') return menuKey(k);
    if (view === 'finished') {
      if (k === 'Enter' || k === 'l' || k === ':') openMenu();
      return;
    }

    const v = session.vim;
    if (session.done && k === 'Enter' && v.mode === 'normal' && !v.pending.length) { nextLesson(); return; }

    const wasDone = session.done;
    session.feed(k);
    echo.push(k);
    if (echo.length > 60) echo = echo.slice(-60);

    if (session.vim.quit && LESSONS[idx].id !== 'quit') {
      session.vim.quit = false;
      session.vim.setMsg('Nice try. In here, :next skips, :reset restarts and :lessons lists everything.');
    }
    if (session.done && !wasDone) {
      const id = LESSONS[idx].id;
      const best = progress.done[id];
      if (best == null || session.keys < best) progress.done[id] = session.keys;
      saveProgress();
    }
    if (queued) { const f = queued; queued = null; f(); return; }
    render();
  }

  let menuG = false;
  function menuKey(k) {
    const g = menuG;
    menuG = false;
    switch (k) {
      case 'j': case 'ArrowDown': menuSel = Math.min(LESSONS.length - 1, menuSel + 1); break;
      case 'k': case 'ArrowUp': menuSel = Math.max(0, menuSel - 1); break;
      case 'G': menuSel = LESSONS.length - 1; break;
      case 'g': if (g) menuSel = 0; else menuG = true; break;
      case 'Enter': case 'l': case 'ArrowRight': startLesson(menuSel); return;
      case 'Escape': case 'q': case 'h': case 'ArrowLeft': closeMenu(); return;
      default: return;
    }
    render();
  }

  // ---------- rendering ----------
  function render() {
    if (view === 'welcome') screen.innerHTML = welcomeHTML();
    else if (view === 'menu') screen.innerHTML = menuHTML();
    else if (view === 'finished') screen.innerHTML = finishedHTML();
    else screen.innerHTML = lessonHTML();
    footer.innerHTML = footerHTML();
    const sel = screen.querySelector('.item.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
    document.getElementById('btn-hint').hidden = view !== 'lesson';
    document.getElementById('btn-reset').hidden = view !== 'lesson';
  }

  function welcomeHTML() {
    const solved = Object.keys(progress.done).length;
    const touch = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    return `<div class="welcome">
      <div class="banner">${esc(BANNER)}</div>
      <p class="welcome-lead">Learn vim by doing.</p>
      <p>${LESSONS.length} short exercises, all inside this terminal.</p>
      <p class="dim">Your keyboard is the controller. Every lesson runs a small vim emulator, so what you learn here works in the real thing.</p>
      <p class="welcome-meta"><span class="meta-rule"></span>${solved ? `${solved} / ${LESSONS.length} lessons complete` : 'a hands-on guide to the editor you already have'}<span class="meta-rule"></span></p>
      <p class="prompt">press <kbd>Enter</kbd> to ${solved ? 'continue' : 'start'} · press <kbd>l</kbd> to browse lessons<span class="blink">_</span></p>
      ${touch ? '<p class="mobile-note">heads up: this needs a physical keyboard.</p>' : ''}
    </div>`;
  }

  function menuHTML() {
    let html = '<div class="menu"><div class="menu-head">lessons: <kbd>j</kbd>/<kbd>k</kbd> to move, <kbd>Enter</kbd> to open, <kbd>Esc</kbd> to close</div>';
    let ch = -1;
    LESSONS.forEach((L, i) => {
      if (L.chapter !== ch) { ch = L.chapter; html += `<div class="ch">${ch + 1}. ${esc(CHAPTERS[ch])}</div>`; }
      const best = progress.done[L.id];
      const solved = best != null;
      html += `<div class="item${i === menuSel ? ' sel' : ''}${solved ? ' solved' : ''}" data-i="${i}">`
        + `<span class="mark">${solved ? '[x]' : '[ ]'}</span><span>${pad(i + 1, 2)}  ${esc(L.title)}</span>`
        + `<span class="best">${solved ? best + ' keys' : ''}</span></div>`;
    });
    return html + '</div>';
  }

  function finishedHTML() {
    const solved = LESSONS.filter((l) => l.id in progress.done).length;
    let underPar = 0;
    for (const L of LESSONS) {
      const best = progress.done[L.id];
      if (best != null && best <= new Session(L).par) underPar++;
    }
    return `<div class="welcome">
      <div class="banner">${esc(BANNER)}</div>
      <p class="ok">✓ you made it through every lesson.</p>
      <p>${solved}/${LESSONS.length} solved · ${underPar} at or under par.</p>
      <p class="dim">You can officially exit vim now. Next steps: run <kbd>vimtutor</kbd> in a real terminal, then try <kbd>:help</kbd>.</p>
      <p class="prompt">press <kbd>Enter</kbd> to revisit lessons<span class="blink">_</span></p>
    </div>`;
  }

  function lessonHTML() {
    const L = LESSONS[idx], s = session, v = s.vim;
    const targetsInfo = s.targets.length ? ` <span class="dim">(${s.targets.length - s.remaining}/${s.targets.length})</span>` : '';
    let html = `<div class="lesson">
      <div class="crumb"><span>chapter ${L.chapter + 1} · ${esc(CHAPTERS[L.chapter])}</span><span>${pad(idx + 1, 2)}/${LESSONS.length}</span></div>
      <h1>${esc(L.title)}</h1>
      ${L.body.map((p) => `<p>${md(p)}</p>`).join('')}
      <p class="goal"><span class="tag">GOAL</span>${md(L.goal)}${targetsInfo}</p>`;
    if (showHint && !s.done) html += `<p class="hint"><span class="tag">HINT</span>${md(L.hint)}</p>`;
    if (s.done) {
      const parNote = s.par ? (s.keys <= s.par ? ' (par or better!)' : ` (par ${s.par})`) : '';
      const nextNote = idx < LESSONS.length - 1 ? 'for the next lesson' : 'to finish';
      html += `<p class="done">✓ solved in ${s.keys} keystroke${s.keys === 1 ? '' : 's'}${parNote}. Press <kbd>Enter</kbd> ${nextNote}.</p>`;
    }
    html += '</div>';
    html += `<div class="editor"><div class="buf">${bufferHTML(v, s)}</div>${statusHTML(v, L)}${cmdHTML(v)}</div>`;
    if (L.expected != null) html += wantHTML(v, L.expected);
    return html;
  }

  function selectionTest(v) {
    const inVisual = v.mode === 'visual' || (v.mode === 'cmdline' && v.cmdFrom === 'visual');
    if (!inVisual || !v.visualStart) return null;
    const a = v.visualStart, b = { row: v.row, col: v.col };
    if (v.visualLine) {
      const r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row);
      return (r) => r >= r1 && r <= r2;
    }
    let s = v.off(a.row, a.col), e = v.off(b.row, b.col);
    if (s > e) [s, e] = [e, s];
    return (r, c) => { const o = v.off(r, c); return o >= s && o <= e; };
  }

  function bufferHTML(v, s) {
    const rows = Math.max(v.lines.length, 6);
    const gw = Math.max(2, String(v.lines.length).length);
    const inSel = selectionTest(v);
    const tmap = new Map(s.targets.map((t) => [t.r + ',' + t.c, t.hit]));
    const cursorClass = v.mode === 'insert' ? 'cursor-bar' : v.mode === 'cmdline' ? 'cursor-idle' : 'cursor';
    let html = '';
    for (let r = 0; r < rows; r++) {
      if (r >= v.lines.length) {
        html += `<div class="ln"><span class="gutter">${' '.repeat(gw)} </span><span class="tilde">~</span></div>`;
        continue;
      }
      const line = v.lines[r];
      const isCur = r === v.row;
      const extra = (isCur && v.col >= line.length) || (inSel && line.length === 0 && inSel(r, 0));
      let out = '';
      for (let c = 0; c < line.length + (extra ? 1 : 0); c++) {
        const ch = c < line.length ? line[c] : ' ';
        const cls = [];
        if (isCur && c === v.col) cls.push(cursorClass);
        else if (inSel && inSel(r, c)) cls.push('sel');
        const key = r + ',' + c;
        if (tmap.has(key)) cls.push(tmap.get(key) ? 'tgt hit' : 'tgt');
        out += cls.length ? `<span class="${cls.join(' ')}">${esc(ch)}</span>` : esc(ch);
      }
      html += `<div class="ln${isCur ? ' cur' : ''}"><span class="gutter">${pad(r + 1, gw)} </span>${out}</div>`;
    }
    return html;
  }

  function statusHTML(v, L) {
    const modified = v.text() !== L.buffer ? ' [+]' : '';
    const showcmd = v.pending.map(keyLabel).join('');
    return `<div class="status"><span>${esc(v.filename)}${modified}</span>`
      + `<span class="right"><span>${esc(showcmd)}</span><span>${v.row + 1},${v.col + 1}</span><span>All</span></span></div>`;
  }

  function cmdHTML(v) {
    let inner = '';
    if (v.mode === 'cmdline') inner = `${esc(v.cmd.type + v.cmd.text)}<span class="cursor"> </span>`;
    else if (v.message) inner = `<span class="${v.error ? 'err' : ''}">${esc(v.message)}</span>`;
    else if (v.mode === 'insert') inner = '<span class="mode">-- INSERT --</span>';
    else if (v.mode === 'visual') inner = `<span class="mode">-- VISUAL${v.visualLine ? ' LINE' : ''} --</span>`;
    return `<div class="cmd">${inner || ' '}</div>`;
  }

  function wantHTML(v, expected) {
    const want = expected.split('\n');
    const gw = Math.max(2, String(want.length).length);
    const rows = want.map((line, r) => {
      const diff = v.lines[r] !== line;
      return `<div class="ln${diff ? ' diff' : ''}"><span class="gutter">${diff ? pad('~', gw) : pad(r + 1, gw)} </span>${esc(line) || ' '}</div>`;
    }).join('');
    const extraLines = v.lines.length > want.length ? ` · your buffer has ${v.lines.length - want.length} extra line(s)` : '';
    return `<div class="want"><div class="want-head">target text: lines marked ~ still differ${extraLines}</div>${rows}</div>`;
  }

  function footerHTML() {
    if (view === 'lesson') {
      const keys = echo.slice(-32).map((k) => `<b>${esc(keyLabel(k))}</b>`).join(' ');
      const par = session.par ? ` · par ${session.par}` : '';
      return `<span class="echo">${keys || 'keys you type show up here'}</span><span>${session.keys} keys${par}</span>`;
    }
    if (view === 'menu') return '<span>j/k move · gg/G jump · Enter open · Esc close</span><span></span>';
    return '<span>tip: Ctrl-[ works as Esc too</span><span></span>';
  }

  // ---------- mouse ----------
  screen.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (item) startLesson(parseInt(item.dataset.i, 10));
    screen.focus();
  });
  document.getElementById('btn-lessons').addEventListener('click', () => { if (view === 'menu') closeMenu(); else openMenu(); screen.focus(); });
  document.getElementById('btn-hint').addEventListener('click', () => { showHint = !showHint; render(); screen.focus(); });
  document.getElementById('btn-reset').addEventListener('click', () => { resetLesson(); screen.focus(); });

  screen.addEventListener('click', (e) => {
    if (view !== 'welcome') return;
    if (e.target.closest('.prompt')) {
      const last = LESSONS[progress.last];
      startLesson(last && !(last.id in progress.done) ? progress.last : firstUnsolved());
    }
  });

  render();
  screen.focus();
})();
