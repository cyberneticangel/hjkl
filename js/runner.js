// runner.js — runs one lesson: owns the Vim instance, blocks disallowed keys,
// tracks visited targets and decides when the lesson is complete.
(function (root) {
  'use strict';

  const { Vim, parseKeys } = typeof module === 'object' && module.exports ? require('./vim.js') : root.HJKL;

  class Session {
    constructor(lesson, opts = {}) {
      this.lesson = lesson;
      this.opts = opts;
      this.par = lesson.solution ? parseKeys(lesson.solution).length : null;
      this.reset();
    }

    reset() {
      const L = this.lesson;
      const [row, col] = L.cursor || [0, 0];
      this.vim = new Vim(L.buffer, { row, col, filename: `${L.id}.txt`, exHandler: this.opts.exHandler });
      if (L.setup) {
        for (const k of parseKeys(L.setup)) this.vim.key(k);
        this.vim.row = row; this.vim.col = col; this.vim.clamp();
        this.vim.setMsg('');
      }
      this.targets = (L.targets || []).map(([r, c]) => ({ r, c, hit: false }));
      this.keys = 0;
      this.done = false;
      this.visit();
    }

    get remaining() { return this.targets.filter((t) => !t.hit).length; }

    blocked(k) {
      const d = this.lesson.disallow;
      if (!d || !d.includes(k)) return false;
      const v = this.vim;
      if (v.mode !== 'normal' && v.mode !== 'visual') return false;
      return v.pending.every((p) => /^\d$/.test(p));
    }

    // Returns false when the key was blocked.
    feed(k) {
      if (this.blocked(k)) {
        this.vim.pending = [];
        this.vim.setMsg(this.lesson.blockMsg || `"${k}" is disabled in this lesson`, true);
        return false;
      }
      this.vim.key(k);
      this.keys++;
      this.visit();
      this.check();
      return true;
    }

    visit() {
      for (const t of this.targets) if (t.r === this.vim.row && t.c === this.vim.col) t.hit = true;
    }

    check() {
      if (this.done) return;
      const L = this.lesson, v = this.vim;
      let ok = false;
      if (this.targets.length) ok = this.remaining === 0;
      else if (L.check) ok = !!L.check(v);
      else if (L.expected != null) ok = v.mode === 'normal' && v.text() === L.expected;
      if (ok) this.done = true;
    }
  }

  const api = { Session };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root.HJKL || (root.HJKL = {}), api);
})(typeof window !== 'undefined' ? window : globalThis);
