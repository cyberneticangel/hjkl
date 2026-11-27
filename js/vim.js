// vim.js — a small, DOM-free vim emulator.
// Works as a classic browser script (exposes window.HJKL) and as a CommonJS module (for tests).
(function (root) {
  'use strict';

  const INCOMPLETE = 'incomplete';
  const INVALID = 'invalid';

  const MOTION_KEYS = new Set(['h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', '0', '^', '$', 'G',
    ';', ',', '%', 'n', 'N', '{', '}', 'Enter', '+', '-', '_']);
  const FIND_KEYS = new Set(['f', 'F', 't', 'T']);
  const OPERATORS = new Set(['d', 'c', 'y', '>', '<']);
  const ACTIONS = new Set(['x', 'X', '~', 'J', 'p', 'P', 'u', '<C-r>', '.', 'i', 'a', 'I', 'A',
    'o', 'O', 's', 'S', 'C', 'D', 'Y', 'v', 'V', ':', '/', '?']);
  const OBJECTS = new Set(['w', 'W', '"', "'", '`', '(', ')', 'b', '{', '}', 'B', '[', ']', '<', '>']);
  const VISUAL_KEYS = new Set(['d', 'x', 'y', 'c', 's', '>', '<', '~', 'u', 'U', 'o', 'v', 'V',
    ':', '/', '?', 'D', 'X', 'Y', 'C', 'S']);
  const ARROWS = { ArrowLeft: 'h', ArrowDown: 'j', ArrowUp: 'k', ArrowRight: 'l' };
  const BRACKETS = { '(': '()', ')': '()', b: '()', '{': '{}', '}': '{}', B: '{}', '[': '[]', ']': '[]', '<': '<>', '>': '<>' };

  // 0 = blank, 1 = punctuation (or any non-blank for WORDs), 2 = word character
  function charClass(ch, big) {
    if (ch === undefined || ch === '\n' || ch === ' ' || ch === '\t') return 0;
    if (big) return 1;
    return /[A-Za-z0-9_]/.test(ch) ? 2 : 1;
  }

  const isDigit = (k) => k.length === 1 && k >= '0' && k <= '9';

  function readCount(keys, i) {
    let s = '';
    while (i < keys.length && isDigit(keys[i]) && !(keys[i] === '0' && s === '')) s += keys[i++];
    return [s ? parseInt(s, 10) : 0, i];
  }

  function readMotion(keys, i) {
    if (i >= keys.length) return INCOMPLETE;
    const k = keys[i];
    if (k === 'g') {
      if (i + 1 >= keys.length) return INCOMPLETE;
      return keys[i + 1] === 'g' ? { key: 'gg' } : INVALID;
    }
    if (FIND_KEYS.has(k)) {
      if (i + 1 >= keys.length) return INCOMPLETE;
      const ch = keys[i + 1];
      return ch.length === 1 ? { key: k, ch } : INVALID;
    }
    return MOTION_KEYS.has(k) ? { key: k } : INVALID;
  }

  // Parse a normal-mode key sequence into a command, or INCOMPLETE / INVALID.
  function parseNormal(keys) {
    const [c1, i] = readCount(keys, 0);
    if (i >= keys.length) return INCOMPLETE;
    const k = keys[i];
    if (OPERATORS.has(k)) {
      const [c2, j] = readCount(keys, i + 1);
      if (j >= keys.length) return INCOMPLETE;
      const k2 = keys[j];
      const count = (c1 || 1) * (c2 || 1);
      const hasCount = !!(c1 || c2);
      if (k2 === k) return { type: 'op', op: k, line: true, count };
      if (k2 === 'i' || k2 === 'a') {
        if (j + 1 >= keys.length) return INCOMPLETE;
        return OBJECTS.has(keys[j + 1]) ? { type: 'op', op: k, obj: k2 + keys[j + 1], count } : INVALID;
      }
      const m = readMotion(keys, j);
      if (typeof m === 'string') return m;
      return { type: 'op', op: k, motion: m, count, hasCount };
    }
    if (k === 'r') {
      if (i + 1 >= keys.length) return INCOMPLETE;
      const ch = keys[i + 1];
      return ch.length === 1 ? { type: 'action', key: 'r', ch, count: c1 || 1 } : INVALID;
    }
    if (k === 'Z') {
      if (i + 1 >= keys.length) return INCOMPLETE;
      if (keys[i + 1] === 'Z') return { type: 'action', key: 'ZZ', count: 1 };
      if (keys[i + 1] === 'Q') return { type: 'action', key: 'ZQ', count: 1 };
      return INVALID;
    }
    if (ACTIONS.has(k)) return { type: 'action', key: k, count: c1 || 1, hasCount: !!c1 };
    const m = readMotion(keys, i);
    if (typeof m === 'string') return m;
    return { type: 'motion', motion: m, count: c1 || 1, hasCount: !!c1 };
  }

  function parseVisual(keys) {
    const [count, i] = readCount(keys, 0);
    if (i >= keys.length) return INCOMPLETE;
    const k = keys[i];
    if (k === 'i' || k === 'a') {
      if (i + 1 >= keys.length) return INCOMPLETE;
      return OBJECTS.has(keys[i + 1]) ? { type: 'obj', obj: k + keys[i + 1] } : INVALID;
    }
    if (VISUAL_KEYS.has(k)) return { type: 'vaction', key: k, count: count || 1 };
    const m = readMotion(keys, i);
    if (typeof m === 'string') return m;
    return { type: 'motion', motion: m, count: count || 1, hasCount: !!count };
  }

  // "dwi hi<Esc>" -> ['d','w','i',' ','h','i','Escape']
  const KEY_NAMES = {
    Esc: 'Escape', CR: 'Enter', Enter: 'Enter', BS: 'Backspace', Tab: 'Tab', lt: '<', Space: ' ',
    'C-r': '<C-r>', 'C-[': 'Escape', 'C-c': 'Escape', Left: 'ArrowLeft', Right: 'ArrowRight',
    Up: 'ArrowUp', Down: 'ArrowDown', Del: 'Delete',
  };
  function parseKeys(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '<') {
        const j = s.indexOf('>', i);
        if (j > i + 1) {
          const name = s.slice(i + 1, j);
          if (Object.prototype.hasOwnProperty.call(KEY_NAMES, name)) { out.push(KEY_NAMES[name]); i = j; continue; }
        }
      }
      out.push(s[i]);
    }
    return out;
  }

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const toggleCase = (ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase());

  class Vim {
    constructor(text = '', opts = {}) {
      this.lines = String(text).split('\n');
      this.row = opts.row || 0;
      this.col = opts.col || 0;
      this.mode = 'normal'; // normal | insert | visual | cmdline
      this.visualLine = false;
      this.visualStart = null;
      this.visRows = null;
      this.pending = [];
      this.reg = { text: '', linewise: false };
      this.undoStack = [];
      this.redoStack = [];
      this.insertDepth = -1;
      this.cmd = null; // { type: ':' | '/' | '?', text }
      this.cmdFrom = 'normal';
      this.message = '';
      this.error = false;
      this.lastFind = null;
      this.lastSearch = null;
      this.lastChange = null;
      this.rec = null;
      this.replaying = false;
      this.exLog = [];
      this.quit = false;
      this.written = false;
      this.filename = opts.filename || 'buffer.txt';
      this.exHandler = opts.exHandler || null;
      this.shiftwidth = 4;
      this.clamp();
      this.curswant = this.col;
    }

    // ---------- buffer helpers ----------
    text() { return this.lines.join('\n'); }
    setText(t) { this.lines = t.split('\n'); }
    get last() { return this.lines.length - 1; }
    off(r, c) { let o = 0; for (let i = 0; i < r; i++) o += this.lines[i].length + 1; return o + c; }
    pos(o) {
      let r = 0;
      while (r < this.last && o > this.lines[r].length) { o -= this.lines[r].length + 1; r++; }
      return { row: r, col: Math.max(0, Math.min(o, this.lines[r].length)) };
    }
    indentLen(r) { const i = this.lines[r].search(/\S/); return i < 0 ? this.lines[r].length : i; }
    fnb(r = this.row) { const i = this.lines[r].search(/\S/); return i < 0 ? Math.max(0, this.lines[r].length - 1) : i; }
    maxCol(r = this.row) { const n = this.lines[r].length; return this.mode === 'insert' ? n : Math.max(0, n - 1); }
    clamp() {
      this.row = Math.max(0, Math.min(this.row, this.last));
      this.col = Math.max(0, Math.min(this.col, this.maxCol()));
    }
    setMsg(m, err = false) { this.message = m; this.error = err; }

    charAt(p) { const l = this.lines[p.r]; return p.c < l.length ? l[p.c] : '\n'; }
    adv(p) {
      if (p.c < this.lines[p.r].length) { p.c++; return true; }
      if (p.r < this.last) { p.r++; p.c = 0; return true; }
      return false;
    }
    ret(p) {
      if (p.c > 0) { p.c--; return true; }
      if (p.r > 0) { p.r--; p.c = this.lines[p.r].length; return true; }
      return false;
    }

    // ---------- undo ----------
    snapshot() { return { lines: this.lines.slice(), row: this.row, col: this.col }; }
    restore(s) { this.lines = s.lines.slice(); this.row = s.row; this.col = s.col; this.clamp(); this.curswant = this.col; }
    beginChange() {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > 500) this.undoStack.shift();
      this.redoStack = [];
    }
    undo(count) {
      for (let i = 0; i < count; i++) {
        const s = this.undoStack.pop();
        if (!s) { this.setMsg('Already at oldest change'); return; }
        this.redoStack.push(this.snapshot());
        this.restore(s);
      }
    }
    redo(count) {
      for (let i = 0; i < count; i++) {
        const s = this.redoStack.pop();
        if (!s) { this.setMsg('Already at newest change'); return; }
        this.undoStack.push(this.snapshot());
        this.restore(s);
      }
    }

    // ---------- input ----------
    key(k) {
      if (k === '<C-[>' || k === '<C-c>') k = 'Escape';
      if (this.mode !== 'cmdline') this.setMsg('');
      if (this.mode === 'insert') return this.insertKey(k);
      if (this.mode === 'cmdline') return this.cmdKey(k);
      return this.normalKey(k);
    }

    normalKey(k) {
      if (ARROWS[k]) k = ARROWS[k];
      if (k === 'Escape') {
        this.pending = [];
        if (this.mode === 'visual') this.exitVisual();
        return;
      }
      this.pending.push(k);
      const cmd = this.mode === 'visual' ? parseVisual(this.pending) : parseNormal(this.pending);
      if (cmd === INCOMPLETE) return;
      const keys = this.pending;
      this.pending = [];
      if (cmd === INVALID) return;
      if (this.mode === 'visual') { this.execVisual(cmd); return; }
      const changed = this.exec(cmd);
      if (changed && !this.replaying) {
        if (this.mode === 'insert') this.rec = keys.slice();
        else this.lastChange = keys.slice();
      }
    }

    exec(cmd) {
      if (cmd.type === 'motion') { this.moveTo(cmd.motion, cmd.count, cmd.hasCount); return false; }
      if (cmd.type === 'op') return this.execOp(cmd);
      return this.action(cmd);
    }

    moveTo(m, count, hasCount) {
      const t = this.motionTarget(m, count, hasCount, false);
      if (!t) return false;
      this.row = t.row;
      if (t.keepCol) { this.col = this.curswant; this.clamp(); }
      else {
        this.col = t.col;
        this.clamp();
        this.curswant = t.want !== undefined ? t.want : this.col;
      }
      return true;
    }

    // ---------- motions ----------
    nextWord(p0, big) {
      const p = { r: p0.r, c: p0.c };
      const k = charClass(this.charAt(p), big);
      if (k !== 0) {
        while (charClass(this.charAt(p), big) === k) { if (!this.adv(p)) return p; }
      }
      for (;;) {
        if (charClass(this.charAt(p), big) !== 0) break;
        if (this.lines[p.r].length === 0 && p.r !== p0.r) break;
        if (!this.adv(p)) break;
      }
      return p;
    }

    prevWord(p0, big) {
      const p = { r: p0.r, c: p0.c };
      if (!this.ret(p)) return p;
      while (charClass(this.charAt(p), big) === 0) {
        if (this.lines[p.r].length === 0) return p;
        if (!this.ret(p)) return p;
      }
      const k = charClass(this.charAt(p), big);
      for (;;) {
        const q = { r: p.r, c: p.c };
        if (!this.ret(q) || q.r !== p.r || charClass(this.charAt(q), big) !== k) break;
        p.c = q.c;
      }
      return p;
    }

    wordEnd(p0, big) {
      const p = { r: p0.r, c: p0.c };
      if (!this.adv(p)) return p0;
      while (charClass(this.charAt(p), big) === 0) { if (!this.adv(p)) return p0; }
      const k = charClass(this.charAt(p), big);
      for (;;) {
        const q = { r: p.r, c: p.c };
        if (!this.adv(q) || q.r !== p.r || charClass(this.charAt(q), big) !== k) break;
        p.c = q.c;
      }
      return p;
    }

    findChar(key, ch, count, repeat) {
      const line = this.lines[this.row];
      let c = this.col;
      for (let n = 0; n < count; n++) {
        if (key === 'f' || key === 't') {
          const start = key === 't' && (repeat || n > 0) ? c + 2 : c + 1;
          const idx = line.indexOf(ch, start);
          if (idx < 0) return null;
          c = key === 't' ? idx - 1 : idx;
        } else {
          const start = key === 'T' && (repeat || n > 0) ? c - 2 : c - 1;
          if (start < 0) return null;
          const idx = line.lastIndexOf(ch, start);
          if (idx < 0) return null;
          c = key === 'T' ? idx + 1 : idx;
        }
      }
      return { row: this.row, col: c, inclusive: key === 'f' || key === 't' };
    }

    matchPair() {
      const line = this.lines[this.row];
      let i = this.col;
      while (i < line.length && !'()[]{}'.includes(line[i])) i++;
      if (i >= line.length) return null;
      const text = this.text();
      const o = this.off(this.row, i);
      const ch = text[o];
      const other = { '(': ')', '[': ']', '{': '}', ')': '(', ']': '[', '}': '{' }[ch];
      const step = '([{'.includes(ch) ? 1 : -1;
      let depth = 0;
      for (let j = o + step; j >= 0 && j < text.length; j += step) {
        if (text[j] === ch) depth++;
        else if (text[j] === other) {
          if (depth === 0) return Object.assign(this.pos(j), { inclusive: true });
          depth--;
        }
      }
      return null;
    }

    search(pat, fwd, row, col) {
      const text = this.text();
      const o = this.off(row, col);
      let i;
      if (fwd) {
        i = text.indexOf(pat, o + 1);
        if (i < 0) { i = text.indexOf(pat); if (i >= 0) this.setMsg('search hit BOTTOM, continuing at TOP', true); }
      } else {
        i = o > 0 ? text.lastIndexOf(pat, o - 1) : -1;
        if (i < 0) { i = text.lastIndexOf(pat); if (i >= 0) this.setMsg('search hit TOP, continuing at BOTTOM', true); }
      }
      if (i < 0) { this.setMsg('E486: Pattern not found: ' + pat, true); return null; }
      return this.pos(i);
    }

    motionTarget(m, count, hasCount, op) {
      const r = this.row, c = this.col, L = this.lines;
      switch (m.key) {
        case 'h': return c === 0 ? null : { row: r, col: Math.max(0, c - count) };
        case 'l': {
          const max = op ? L[r].length : Math.max(0, L[r].length - 1);
          return c >= max ? null : { row: r, col: Math.min(max, c + count) };
        }
        case 'j': case 'k': {
          const nr = m.key === 'j' ? Math.min(this.last, r + count) : Math.max(0, r - count);
          return nr === r ? null : { row: nr, col: c, linewise: true, keepCol: true };
        }
        case 'Enter': case '+': case '-': {
          const nr = m.key === '-' ? Math.max(0, r - count) : Math.min(this.last, r + count);
          return nr === r ? null : { row: nr, col: this.fnb(nr), linewise: true };
        }
        case '_': { const nr = Math.min(this.last, r + count - 1); return { row: nr, col: this.fnb(nr), linewise: true }; }
        case 'w': case 'W': {
          let p = { r, c };
          for (let i = 0; i < count; i++) p = this.nextWord(p, m.key === 'W');
          // "dw" on the last word of a line doesn't eat the line break
          if (op && p.r > r && p.c <= this.indentLen(p.r)) p = { r: p.r - 1, c: L[p.r - 1].length };
          return { row: p.r, col: p.c };
        }
        case 'b': case 'B': {
          let p = { r, c };
          for (let i = 0; i < count; i++) p = this.prevWord(p, m.key === 'B');
          return { row: p.r, col: p.c };
        }
        case 'e': case 'E': {
          let p = { r, c };
          for (let i = 0; i < count; i++) p = this.wordEnd(p, m.key === 'E');
          return { row: p.r, col: p.c, inclusive: true };
        }
        case '0': return { row: r, col: 0 };
        case '^': return { row: r, col: this.fnb(r) };
        case '$': {
          const nr = Math.min(this.last, r + count - 1);
          return { row: nr, col: Math.max(0, L[nr].length - 1), inclusive: true, want: Infinity };
        }
        case 'G': case 'gg': {
          const nr = hasCount ? Math.min(this.last, count - 1) : (m.key === 'G' ? this.last : 0);
          return { row: nr, col: this.fnb(nr), linewise: true };
        }
        case 'f': case 'F': case 't': case 'T':
          this.lastFind = { key: m.key, ch: m.ch };
          return this.findChar(m.key, m.ch, count, false);
        case ';': case ',': {
          if (!this.lastFind) return null;
          let k = this.lastFind.key;
          if (m.key === ',') k = { f: 'F', F: 'f', t: 'T', T: 't' }[k];
          return this.findChar(k, this.lastFind.ch, count, true);
        }
        case '%': return this.matchPair();
        case 'n': case 'N': {
          if (!this.lastSearch) { this.setMsg('E35: No previous regular expression', true); return null; }
          const fwd = this.lastSearch.forward === (m.key === 'n');
          let p = { row: r, col: c };
          for (let i = 0; i < count; i++) { p = this.search(this.lastSearch.pat, fwd, p.row, p.col); if (!p) return null; }
          if (!this.error) this.setMsg((fwd ? '/' : '?') + this.lastSearch.pat);
          return p;
        }
        case '}': {
          let nr = r;
          for (let i = 0; i < count; i++) {
            while (nr < this.last && L[nr] === '') nr++;
            while (nr < this.last && L[nr] !== '') nr++;
          }
          const col = L[nr] === '' ? 0 : (op ? L[nr].length : Math.max(0, L[nr].length - 1));
          return { row: nr, col };
        }
        case '{': {
          let nr = r;
          for (let i = 0; i < count; i++) {
            while (nr > 0 && L[nr] === '') nr--;
            while (nr > 0 && L[nr] !== '') nr--;
          }
          return { row: nr, col: 0 };
        }
      }
      return null;
    }

    // ---------- text objects ----------
    textObject(spec) {
      const inner = spec[0] === 'i', ch = spec[1];
      if (ch === 'w' || ch === 'W') return this.wordObject(inner, ch === 'W');
      if (ch === '"' || ch === "'" || ch === '`') return this.quoteObject(inner, ch);
      if (BRACKETS[ch]) return this.bracketObject(inner, BRACKETS[ch][0], BRACKETS[ch][1]);
      return null;
    }

    wordObject(inner, big) {
      const r = this.row, line = this.lines[r];
      if (!line.length) return null;
      const k = charClass(line[this.col], big);
      let s = this.col, e = this.col;
      while (s > 0 && charClass(line[s - 1], big) === k) s--;
      while (e < line.length - 1 && charClass(line[e + 1], big) === k) e++;
      if (!inner) {
        if (k !== 0) {
          let e2 = e;
          while (e2 < line.length - 1 && charClass(line[e2 + 1]) === 0) e2++;
          if (e2 > e) e = e2;
          else while (s > 0 && charClass(line[s - 1]) === 0) s--;
        } else if (e < line.length - 1) {
          const k2 = charClass(line[e + 1], big);
          e++;
          while (e < line.length - 1 && charClass(line[e + 1], big) === k2) e++;
        }
      }
      return { s: this.off(r, s), e: this.off(r, e) + 1 };
    }

    quoteObject(inner, q) {
      const r = this.row, line = this.lines[r], qs = [];
      for (let i = 0; i < line.length; i++) if (line[i] === q && line[i - 1] !== '\\') qs.push(i);
      let a = -1, b = -1;
      for (let i = 0; i + 1 < qs.length; i += 2) {
        if (this.col >= qs[i] && this.col <= qs[i + 1]) { a = qs[i]; b = qs[i + 1]; break; }
      }
      if (a < 0) {
        for (let i = 0; i + 1 < qs.length; i += 2) if (qs[i] > this.col) { a = qs[i]; b = qs[i + 1]; break; }
      }
      if (a < 0) return null;
      if (inner) return { s: this.off(r, a + 1), e: this.off(r, b) };
      let e = b + 1;
      while (e < line.length && line[e] === ' ') e++;
      return { s: this.off(r, a), e: this.off(r, e) };
    }

    bracketObject(inner, open, close) {
      const text = this.text(), cur = this.off(this.row, this.col);
      let o = -1, depth = 0;
      for (let i = cur; i >= 0; i--) {
        if (text[i] === close && i !== cur) depth++;
        else if (text[i] === open) { if (depth === 0) { o = i; break; } depth--; }
      }
      if (o < 0) return null;
      let c = -1;
      depth = 0;
      for (let i = o + 1; i < text.length; i++) {
        if (text[i] === open) depth++;
        else if (text[i] === close) { if (depth === 0) { c = i; break; } depth--; }
      }
      if (c < 0) return null;
      if (!inner) return { s: o, e: c + 1 };
      if (text[o + 1] === '\n') {
        // multi-line block: work on the whole inner lines
        const r1 = this.pos(o).row + 1;
        const cp = this.pos(c);
        const r2 = this.lines[cp.row].slice(0, cp.col).trim() === '' ? cp.row - 1 : cp.row;
        if (r1 <= r2) return { linewise: true, r1, r2 };
        return { s: o + 1, e: o + 1 };
      }
      return { s: o + 1, e: c };
    }

    // ---------- operators ----------
    changeWordTarget(count, big) {
      const p = { r: this.row, c: this.col };
      const k = charClass(this.charAt(p), big);
      for (;;) {
        const q = { r: p.r, c: p.c };
        if (!this.adv(q) || q.r !== p.r || charClass(this.charAt(q), big) !== k) break;
        p.c = q.c;
      }
      let t = p;
      for (let i = 1; i < count; i++) t = this.wordEnd(t, big);
      return { row: t.r, col: t.c, inclusive: true };
    }

    execOp(cmd) {
      const { op, count } = cmd;
      let range;
      if (cmd.line) {
        range = { linewise: true, r1: this.row, r2: Math.min(this.last, this.row + count - 1) };
      } else if (cmd.obj) {
        range = this.textObject(cmd.obj);
        if (!range) return false;
      } else {
        const m = cmd.motion;
        let t;
        const big = m.key === 'W';
        if (op === 'c' && (m.key === 'w' || big) && charClass(this.charAt({ r: this.row, c: this.col }), big) !== 0) {
          t = this.changeWordTarget(count, big);
        } else {
          t = this.motionTarget(m, count, cmd.hasCount, true);
        }
        if (!t) return false;
        if (t.linewise) {
          range = { linewise: true, r1: Math.min(this.row, t.row), r2: Math.max(this.row, t.row) };
        } else {
          const text = this.text();
          const a = this.off(this.row, this.col), b = this.off(t.row, t.col);
          let s = Math.min(a, b), e = Math.max(a, b);
          if (t.inclusive) { e += 1; if (e > text.length || text[e - 1] === '\n') e -= 1; }
          range = { s, e };
        }
      }
      return this.applyOp(op, range);
    }

    shift(line, right) {
      if (right) return line.length ? ' '.repeat(this.shiftwidth) + line : line;
      return line.replace(new RegExp('^( {1,' + this.shiftwidth + '}|\\t)'), '');
    }

    applyOp(op, rg) {
      if (rg.linewise) {
        const { r1, r2 } = rg, n = r2 - r1 + 1;
        const chunk = this.lines.slice(r1, r2 + 1);
        if (op === 'y') {
          this.reg = { text: chunk.join('\n'), linewise: true };
          this.row = r1; this.clamp();
          if (n > 2) this.setMsg(`${n} lines yanked`);
          return false;
        }
        this.beginChange();
        if (op === '>' || op === '<') {
          for (let r = r1; r <= r2; r++) this.lines[r] = this.shift(this.lines[r], op === '>');
          this.row = r1; this.col = this.fnb(r1); this.curswant = this.col;
          if (n > 2) this.setMsg(`${n} lines ${op}ed 1 time`);
          return true;
        }
        this.reg = { text: chunk.join('\n'), linewise: true };
        if (op === 'd') {
          this.lines.splice(r1, n);
          if (!this.lines.length) this.lines = [''];
          this.row = Math.min(r1, this.last); this.col = this.fnb(); this.curswant = this.col;
          if (n > 2) this.setMsg(`${n} fewer lines`);
          return true;
        }
        // c
        this.lines.splice(r1, n, '');
        this.row = r1; this.col = 0;
        this.enterInsert(true);
        return true;
      }

      const { s, e } = rg;
      const text = this.text();
      const chunk = text.slice(s, e);
      if (op === 'y') {
        this.reg = { text: chunk, linewise: false };
        const p = this.pos(s); this.row = p.row; this.col = p.col; this.clamp(); this.curswant = this.col;
        return false;
      }
      if (op === '>' || op === '<') {
        return this.applyOp(op, { linewise: true, r1: this.pos(s).row, r2: this.pos(Math.max(s, e - 1)).row });
      }
      if (op === 'c') {
        this.beginChange();
        if (chunk) this.reg = { text: chunk, linewise: false };
        this.setText(text.slice(0, s) + text.slice(e));
        const p = this.pos(s); this.row = p.row; this.col = p.col;
        this.enterInsert(true);
        return true;
      }
      if (s === e) return false;
      this.beginChange();
      this.reg = { text: chunk, linewise: false };
      this.setText(text.slice(0, s) + text.slice(e));
      const p = this.pos(s); this.row = p.row; this.col = p.col; this.clamp(); this.curswant = this.col;
      return true;
    }

    enterInsert(alreadyBegun) {
      if (!alreadyBegun) this.beginChange();
      this.insertDepth = this.undoStack.length;
      this.mode = 'insert';
    }

    put(after, count) {
      const reg = this.reg;
      if (!reg.text && !reg.linewise) return false;
      this.beginChange();
      if (reg.linewise) {
        const chunk = [];
        for (let i = 0; i < count; i++) chunk.push(...reg.text.split('\n'));
        const r = after ? this.row + 1 : this.row;
        this.lines.splice(r, 0, ...chunk);
        this.row = r; this.col = this.fnb(); this.curswant = this.col;
        return true;
      }
      const text = this.text();
      let o = this.off(this.row, this.col);
      if (after && this.lines[this.row].length) o += 1;
      const ins = reg.text.repeat(count);
      this.setText(text.slice(0, o) + ins + text.slice(o));
      const p = this.pos(o + ins.length - 1);
      this.row = p.row; this.col = p.col; this.clamp(); this.curswant = this.col;
      return true;
    }

    repeat() {
      if (!this.lastChange) return;
      const keys = this.lastChange;
      this.replaying = true;
      try { for (const k of keys) this.key(k); } finally { this.replaying = false; }
    }

    action(cmd) {
      const { key, count } = cmd;
      const L = this.lines;
      const line = L[this.row];
      switch (key) {
        case 'x': {
          if (!line.length) return false;
          const a = this.off(this.row, this.col);
          return this.applyOp('d', { s: a, e: a + Math.min(count, line.length - this.col) });
        }
        case 'X': {
          if (!this.col) return false;
          const a = this.off(this.row, this.col);
          return this.applyOp('d', { s: a - Math.min(count, this.col), e: a });
        }
        case 'D': return this.execOp({ op: 'd', motion: { key: '$' }, count });
        case 'C': return this.execOp({ op: 'c', motion: { key: '$' }, count });
        case 's': {
          if (!line.length) { this.enterInsert(); return true; }
          const a = this.off(this.row, this.col);
          return this.applyOp('c', { s: a, e: a + Math.min(count, line.length - this.col) });
        }
        case 'S': return this.execOp({ op: 'c', line: true, count });
        case 'Y': return this.execOp({ op: 'y', line: true, count });
        case '~': {
          if (!line.length) return false;
          this.beginChange();
          const e = Math.min(line.length, this.col + count);
          L[this.row] = line.slice(0, this.col) + [...line.slice(this.col, e)].map(toggleCase).join('') + line.slice(e);
          this.col = Math.min(e, line.length - 1); this.curswant = this.col;
          return true;
        }
        case 'r': {
          if (this.col + count > line.length) return false;
          this.beginChange();
          L[this.row] = line.slice(0, this.col) + cmd.ch.repeat(count) + line.slice(this.col + count);
          this.col += count - 1; this.curswant = this.col;
          return true;
        }
        case 'J': {
          if (this.row >= this.last) return false;
          this.beginChange();
          const times = Math.max(1, count - 1);
          for (let i = 0; i < times && this.row < this.last; i++) {
            const cur = L[this.row];
            const nxt = L[this.row + 1].replace(/^\s+/, '');
            const sep = (!cur.length || /\s$/.test(cur) || !nxt.length || nxt[0] === ')') ? '' : ' ';
            L[this.row] = cur + sep + nxt;
            L.splice(this.row + 1, 1);
            this.col = cur.length;
          }
          this.clamp(); this.curswant = this.col;
          return true;
        }
        case 'p': case 'P': return this.put(key === 'p', count);
        case 'u': this.undo(count); return false;
        case '<C-r>': this.redo(count); return false;
        case '.': this.repeat(); return false;
        case 'i': this.enterInsert(); return true;
        case 'a': if (line.length) this.col++; this.enterInsert(); return true;
        case 'I': this.col = this.indentLen(this.row); this.enterInsert(); return true;
        case 'A': this.col = line.length; this.enterInsert(); return true;
        case 'o': case 'O': {
          this.beginChange();
          const r = key === 'o' ? this.row + 1 : this.row;
          L.splice(r, 0, '');
          this.row = r; this.col = 0;
          this.enterInsert(true);
          return true;
        }
        case 'v': case 'V':
          this.mode = 'visual'; this.visualLine = key === 'V';
          this.visualStart = { row: this.row, col: this.col };
          return false;
        case ':': case '/': case '?': this.openCmd(key); return false;
        case 'ZZ': this.ex('x'); return false;
        case 'ZQ': this.ex('q!'); return false;
      }
      return false;
    }

    // ---------- insert mode ----------
    insertKey(k) {
      if (this.rec) this.rec.push(k);
      const L = this.lines, r = this.row, line = L[r];
      switch (k) {
        case 'Escape': {
          this.mode = 'normal';
          if (this.undoStack.length === this.insertDepth) {
            const top = this.undoStack[this.undoStack.length - 1];
            if (top && top.lines.join('\n') === this.text()) this.undoStack.pop();
          }
          this.col = Math.max(0, this.col - 1); this.clamp(); this.curswant = this.col;
          if (this.rec) { this.lastChange = this.rec; this.rec = null; }
          return;
        }
        case 'Backspace':
          if (this.col > 0) { L[r] = line.slice(0, this.col - 1) + line.slice(this.col); this.col--; }
          else if (r > 0) { this.col = L[r - 1].length; L[r - 1] += line; L.splice(r, 1); this.row--; }
          return;
        case 'Delete':
          if (this.col < line.length) L[r] = line.slice(0, this.col) + line.slice(this.col + 1);
          else if (r < this.last) { L[r] += L[r + 1]; L.splice(r + 1, 1); }
          return;
        case 'Enter':
          L[r] = line.slice(0, this.col);
          L.splice(r + 1, 0, line.slice(this.col));
          this.row++; this.col = 0;
          return;
        case 'ArrowLeft': if (this.col > 0) this.col--; return;
        case 'ArrowRight': if (this.col < line.length) this.col++; return;
        case 'ArrowUp': case 'ArrowDown':
          this.row += k === 'ArrowUp' ? -1 : 1; this.clamp(); return;
        case 'Tab': k = '    '; break;
        default: if (k.length !== 1) return;
      }
      L[r] = line.slice(0, this.col) + k + line.slice(this.col);
      this.col += k.length;
    }

    // ---------- visual mode ----------
    exitVisual() { this.mode = 'normal'; this.visualStart = null; this.clamp(); }

    visualRange() {
      const a = this.visualStart, b = { row: this.row, col: this.col };
      if (this.visualLine) return { linewise: true, r1: Math.min(a.row, b.row), r2: Math.max(a.row, b.row) };
      let s = this.off(a.row, a.col), e = this.off(b.row, b.col);
      if (s > e) [s, e] = [e, s];
      return { s, e: Math.min(e + 1, this.text().length) };
    }

    execVisual(cmd) {
      if (cmd.type === 'motion') { this.moveTo(cmd.motion, cmd.count, cmd.hasCount); return; }
      if (cmd.type === 'obj') {
        const rg = this.textObject(cmd.obj);
        if (!rg || rg.linewise || rg.e <= rg.s) return;
        this.visualStart = this.pos(rg.s);
        const b = this.pos(rg.e - 1);
        this.row = b.row; this.col = b.col;
        return;
      }
      const k = cmd.key;
      if (k === 'v' || k === 'V') {
        const line = k === 'V';
        if (this.visualLine === line) this.exitVisual(); else this.visualLine = line;
        return;
      }
      if (k === 'o') {
        const a = this.visualStart;
        this.visualStart = { row: this.row, col: this.col };
        this.row = a.row; this.col = a.col;
        return;
      }
      if (k === ':' || k === '/' || k === '?') { this.openCmd(k); return; }
      let rg = this.visualRange();
      if ('DXYCS'.includes(k) && !rg.linewise) {
        rg = { linewise: true, r1: Math.min(this.visualStart.row, this.row), r2: Math.max(this.visualStart.row, this.row) };
      }
      this.exitVisual();
      if (k === '~' || k === 'u' || k === 'U') {
        const fn = k === '~' ? toggleCase : (k === 'u' ? (c) => c.toLowerCase() : (c) => c.toUpperCase());
        const text = this.text();
        const s = rg.linewise ? this.off(rg.r1, 0) : rg.s;
        const e = rg.linewise ? this.off(rg.r2, this.lines[rg.r2].length) : rg.e;
        this.beginChange();
        this.setText(text.slice(0, s) + [...text.slice(s, e)].map(fn).join('') + text.slice(e));
        const p = this.pos(s); this.row = p.row; this.col = p.col; this.clamp();
        return;
      }
      const op = { d: 'd', x: 'd', D: 'd', X: 'd', y: 'y', Y: 'y', c: 'c', s: 'c', C: 'c', S: 'c', '>': '>', '<': '<' }[k];
      if (op) this.applyOp(op, rg);
    }

    // ---------- command line ----------
    openCmd(type) {
      this.cmdFrom = this.mode;
      this.cmd = { type, text: '' };
      if (type === ':' && this.mode === 'visual') {
        this.cmd.text = "'<,'>";
        this.visRows = [Math.min(this.visualStart.row, this.row), Math.max(this.visualStart.row, this.row)];
      }
      this.mode = 'cmdline';
    }

    cmdKey(k) {
      const c = this.cmd;
      const back = () => {
        this.cmd = null;
        if (this.cmdFrom === 'visual' && c.type !== ':') this.mode = 'visual';
        else { this.mode = 'normal'; this.visualStart = null; }
      };
      if (k === 'Escape') { back(); this.mode = 'normal'; this.visualStart = null; this.clamp(); return; }
      if (k === 'Backspace') { if (!c.text) back(); else c.text = c.text.slice(0, -1); return; }
      if (k === 'Enter') {
        back();
        if (c.type === ':') this.ex(c.text);
        else this.doSearch(c.text, c.type === '/');
        this.clamp();
        return;
      }
      if (k.length === 1) c.text += k;
    }

    doSearch(pat, fwd) {
      if (!pat) {
        if (!this.lastSearch) { this.setMsg('E35: No previous regular expression', true); return; }
        pat = this.lastSearch.pat;
      }
      this.lastSearch = { pat, forward: fwd };
      this.setMsg((fwd ? '/' : '?') + pat);
      const p = this.search(pat, fwd, this.row, this.col);
      if (p) { this.row = p.row; this.col = p.col; this.curswant = p.col; }
    }

    ex(input) {
      const raw = input.trim();
      if (!raw) return;
      this.exLog.push(raw);
      if (this.exHandler && this.exHandler(raw, this)) return;
      let rest = raw, r1 = this.row, r2 = this.row, ranged = false, m;
      const addr = (s) => (s === '.' ? this.row : s === '$' ? this.last : parseInt(s, 10) - 1);
      if (rest[0] === '%') { r1 = 0; r2 = this.last; rest = rest.slice(1); ranged = true; }
      else if (rest.startsWith("'<,'>") && this.visRows) { [r1, r2] = this.visRows; rest = rest.slice(5); ranged = true; }
      else if ((m = rest.match(/^(\d+|\.|\$)(?:,(\d+|\.|\$))?/))) {
        r1 = addr(m[1]); r2 = m[2] ? addr(m[2]) : r1; rest = rest.slice(m[0].length); ranged = true;
      }
      const cl = (r) => Math.max(0, Math.min(this.last, r));
      r1 = cl(r1); r2 = cl(r2);
      if (r1 > r2) [r1, r2] = [r2, r1];
      rest = rest.trim();
      if (!rest) {
        if (ranged) { this.row = r2; this.col = this.fnb(); this.curswant = this.col; }
        return;
      }
      if (/^w(rite)?$/.test(rest)) {
        this.written = true;
        this.setMsg(`"${this.filename}" ${this.lines.length}L, ${this.text().length + 1}B written`);
        return;
      }
      if (/^q(uit)?!?$/.test(rest)) { this.quit = true; return; }
      if (/^(wq|x|xit|exit)!?$/.test(rest)) { this.written = true; this.quit = true; return; }
      if (/^d(elete)?$/.test(rest)) { this.applyOp('d', { linewise: true, r1, r2 }); return; }
      if ((m = rest.match(/^s(?:ubstitute)?([/#|,;:!@])(.*)$/))) { this.substitute(m[1], m[2], r1, r2); return; }
      if (/^noh(lsearch)?$/.test(rest)) return;
      this.setMsg('E492: Not an editor command: ' + raw, true);
    }

    substitute(delim, body, r1, r2) {
      const parts = [];
      let cur = '';
      for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === '\\' && body[i + 1] === delim) { cur += delim; i++; continue; }
        if (ch === delim && parts.length < 2) { parts.push(cur); cur = ''; continue; }
        cur += ch;
      }
      parts.push(cur);
      let [pat, rep = '', flags = ''] = parts;
      if (!pat) {
        if (!this.lastSearch) { this.setMsg('E35: No previous regular expression', true); return; }
        pat = this.lastSearch.pat;
      }
      const re = new RegExp(escapeRe(pat), (flags.includes('g') ? 'g' : '') + (flags.includes('i') ? 'i' : ''));
      const before = this.snapshot();
      let subs = 0, linesHit = 0, lastRow = -1;
      for (let r = r1; r <= r2; r++) {
        let n = 0;
        const out = this.lines[r].replace(re, () => { n++; return rep; });
        if (n) { this.lines[r] = out; subs += n; linesHit++; lastRow = r; }
      }
      if (!subs) { this.setMsg('E486: Pattern not found: ' + pat, true); return; }
      this.undoStack.push(before);
      this.redoStack = [];
      this.lastSearch = { pat, forward: true };
      this.row = lastRow; this.col = this.fnb(); this.curswant = this.col;
      this.setMsg(`${subs} substitution${subs > 1 ? 's' : ''} on ${linesHit} line${linesHit > 1 ? 's' : ''}`);
    }
  }

  const api = { Vim, parseKeys, parseNormal, parseVisual, charClass };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root.HJKL || (root.HJKL = {}), api);
})(typeof window !== 'undefined' ? window : globalThis);
