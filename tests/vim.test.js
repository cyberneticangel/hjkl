'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Vim, parseKeys } = require('../js/vim.js');
const { LESSONS } = require('../js/lessons.js');
const { Session } = require('../js/runner.js');

function run(text, keys, row = 0, col = 0) {
  const v = new Vim(text, { row, col });
  for (const k of parseKeys(keys)) v.key(k);
  return v;
}
const at = (v) => [v.row, v.col];

test('parseKeys', () => {
  assert.deepEqual(parseKeys('ix<Esc>:q<CR>'), ['i', 'x', 'Escape', ':', 'q', 'Enter']);
  assert.deepEqual(parseKeys('<<'), ['<', '<']);
  assert.deepEqual(parseKeys('<C-r>'), ['<C-r>']);
});

test('hjkl and counts', () => {
  assert.deepEqual(at(run('abc\ndef\nghi', 'jl')), [1, 1]);
  assert.deepEqual(at(run('abcdef', '3l')), [0, 3]);
  assert.deepEqual(at(run('abcdef', '10l')), [0, 5]);
  assert.deepEqual(at(run('abc', 'h')), [0, 0]);
  // curswant: column is remembered across short lines
  assert.deepEqual(at(run('abcdef\nx\nabcdef', '4ljj')), [2, 4]);
});

test('word motions', () => {
  const t = 'foo bar.baz  qux';
  assert.deepEqual(at(run(t, 'w')), [0, 4]);
  assert.deepEqual(at(run(t, 'ww')), [0, 7]);
  assert.deepEqual(at(run(t, 'www')), [0, 8]);
  assert.deepEqual(at(run(t, 'W')), [0, 4]);
  assert.deepEqual(at(run(t, 'WW')), [0, 13]);
  assert.deepEqual(at(run(t, 'e')), [0, 2]);
  assert.deepEqual(at(run(t, 'ee')), [0, 6]);
  assert.deepEqual(at(run(t, '$b')), [0, 13]);
  assert.deepEqual(at(run(t, '$bb')), [0, 8]);
  assert.deepEqual(at(run('one\ntwo', 'w')), [1, 0]);
  assert.deepEqual(at(run('one\n\ntwo', 'w')), [1, 0]);
  assert.deepEqual(at(run('one\ntwo', 'jb')), [0, 0]);
});

test('line motions', () => {
  const v = run('   hello world', '$');
  assert.equal(v.col, 13);
  assert.equal(run('   hello', '$0').col, 0);
  assert.equal(run('   hello', '$^').col, 3);
  assert.deepEqual(at(run('a\nb\nc\nd', 'G')), [3, 0]);
  assert.deepEqual(at(run('a\nb\nc\nd', 'Ggg')), [0, 0]);
  assert.deepEqual(at(run('a\nb\nc\nd', '3G')), [2, 0]);
  assert.deepEqual(at(run('a\nb\nc\nd', ':3<CR>')), [2, 0]);
});

test('find and repeat', () => {
  const t = 'a,b,c,d';
  assert.equal(run(t, 'f,').col, 1);
  assert.equal(run(t, 'f,;').col, 3);
  assert.equal(run(t, 'f,;;,').col, 3);
  assert.equal(run(t, 't,').col, 0);
  assert.equal(run(t, 't,;').col, 2);
  assert.equal(run(t, '$F,').col, 5);
  assert.equal(run(t, '2f,').col, 3);
});

test('dw / dd / counts', () => {
  assert.equal(run('one two three', 'dw').text(), 'two three');
  assert.equal(run('one two three', 'd2w').text(), 'three');
  assert.equal(run('one two three', '2dw').text(), 'three');
  assert.equal(run('one two\nthree', 'wdw').text(), 'one \nthree');
  assert.equal(run('one two', 'wdw').text(), 'one ');
  assert.equal(run('a\nb\nc\nd', 'dd').text(), 'b\nc\nd');
  assert.equal(run('a\nb\nc\nd', 'j2dd').text(), 'a\nd');
  assert.equal(run('a\nb', 'dddd').text(), '');
  assert.equal(run('hello world', 'wd$').text(), 'hello ');
  assert.equal(run('hello world', 'wD').text(), 'hello ');
  assert.equal(run('hello world', '$d0').text(), 'd');
  assert.equal(run('a\nb\nc', 'dj').text(), 'c');
});

test('change', () => {
  assert.equal(run('foo bar', 'cwbaz<Esc>').text(), 'baz bar');
  assert.equal(run('a bar', 'cwX<Esc>').text(), 'X bar');
  assert.equal(run('foo bar baz', 'c2wX<Esc>').text(), 'X baz');
  assert.equal(run('foo bar', 'wCxyz<Esc>').text(), 'foo xyz');
  assert.equal(run('  foo\nbar', 'ccnew<Esc>').text(), 'new\nbar');
  assert.equal(run('abc', 'sX<Esc>').text(), 'Xbc');
});

test('text objects', () => {
  assert.equal(run('foo bar baz', 'wlciwX<Esc>').text(), 'foo X baz');
  assert.equal(run('foo bar baz', 'wdaw').text(), 'foo baz');
  assert.equal(run('say "hi there" ok', 'ci"yo<Esc>').text(), 'say "yo" ok');
  assert.equal(run('say "hi there" ok', 'fhda"').text(), 'say ok');
  assert.equal(run('f(a, g(b))', 'fbdi(').text(), 'f(a, g())');
  assert.equal(run('f(a, g(b))', 'fadi(').text(), 'f()');
  assert.equal(run('f(a, g(b))', 'fada(').text(), 'f');
  assert.equal(run('if {\n  a;\n  b;\n}', 'jdi{').text(), 'if {\n}');
  assert.equal(run('x = ""', 'ci"hi<Esc>').text(), 'x = "hi"');
});

test('x X r ~ J', () => {
  assert.equal(run('abc', 'x').text(), 'bc');
  assert.equal(run('abc', '5x').text(), '');
  assert.equal(run('abc', '$X').text(), 'ac');
  assert.equal(run('abc', 'rz').text(), 'zbc');
  assert.equal(run('abc', '2rz').text(), 'zzc');
  assert.equal(run('abc', '4rz').text(), 'abc');
  assert.equal(run('abc', '~~').text(), 'ABc');
  assert.equal(run('foo\n   bar', 'J').text(), 'foo bar');
  assert.equal(run('a\nb\nc', '3J').text(), 'a b c');
});

test('yank and put', () => {
  assert.equal(run('a\nb', 'yyp').text(), 'a\na\nb');
  assert.equal(run('a\nb', 'yyjP').text(), 'a\na\nb');
  assert.equal(run('a\nb', 'ddp').text(), 'b\na');
  assert.equal(run('foo bar', 'ywP').text(), 'foo foo bar');
  assert.equal(run('ab', 'xp').text(), 'ba');
  assert.equal(run('a', 'yy3p').text(), 'a\na\na\na');
});

test('insert variants', () => {
  assert.equal(run('bc', 'iA<Esc>').text(), 'Abc');
  assert.equal(run('ac', 'ab<Esc>').text(), 'abc');
  assert.equal(run('  b', 'Ia<Esc>').text(), '  ab');
  assert.equal(run('a', 'Ab<Esc>').text(), 'ab');
  assert.equal(run('a', 'ob<Esc>').text(), 'a\nb');
  assert.equal(run('a', 'Ob<Esc>').text(), 'b\na');
  assert.equal(run('ab', 'a<CR><Esc>').text(), 'a\nb');
  assert.equal(run('abc', 'A<BS><BS>x<Esc>').text(), 'ax');
  const v = run('abc', 'Ax<Esc>');
  assert.equal(v.mode, 'normal');
  assert.equal(v.col, 3);
});

test('undo / redo', () => {
  assert.equal(run('a\nb\nc', 'dddd').text(), 'c');
  assert.equal(run('a\nb\nc', 'ddddu').text(), 'b\nc');
  assert.equal(run('a\nb\nc', 'dddduu').text(), 'a\nb\nc');
  assert.equal(run('a\nb\nc', 'dddduu<C-r>').text(), 'b\nc');
  assert.equal(run('abc', 'ixyz<Esc>u').text(), 'abc');
  // an insert that changed nothing leaves no undo step behind
  assert.equal(run('abc', 'xi<Esc>u').text(), 'abc');
  assert.equal(run('abc', ':s/b/X/<CR>u').text(), 'abc');
});

test('dot repeat', () => {
  assert.equal(run('a b c d', 'x..').text(), ' c d');
  assert.equal(run('one\ntwo\nthree', 'dd.').text(), 'three');
  assert.equal(run('var a\nvar b', 'ciwlet<Esc>j.').text(), 'let a\nlet b');
  assert.equal(run('a\nb', 'A;<Esc>j.').text(), 'a;\nb;');
});

test('% matching', () => {
  assert.equal(run('if (a(b)) x', '%').col, 8);
  assert.equal(run('if (a(b)) x', '%%').col, 3);
  assert.equal(run('f(a)(b)', 'd%').text(), '(b)');
});

test('search', () => {
  const t = 'foo\nbar foo\nbaz foo';
  assert.deepEqual(at(run(t, '/foo<CR>')), [1, 4]);
  assert.deepEqual(at(run(t, '/foo<CR>n')), [2, 4]);
  const v = run(t, '/foo<CR>nn');
  assert.deepEqual(at(v), [0, 0]);
  assert.match(v.message, /BOTTOM/);
  assert.deepEqual(at(run(t, '/foo<CR>nN')), [1, 4]);
  assert.deepEqual(at(run(t, 'G$?bar<CR>')), [1, 0]);
  assert.match(run(t, '/nope<CR>').message, /E486/);
});

test('substitute', () => {
  assert.equal(run('a a\na a', ':s/a/b/<CR>').text(), 'b a\na a');
  assert.equal(run('a a\na a', ':s/a/b/g<CR>').text(), 'b b\na a');
  assert.equal(run('a a\na a', ':%s/a/b/g<CR>').text(), 'b b\nb b');
  assert.equal(run('x.y', ':s/./!/<CR>').text(), 'x!y');
  assert.equal(run('a/b', ':s/\\//-/<CR>').text(), 'a-b');
  assert.equal(run('a\na\na', ':2,3s/a/b/<CR>').text(), 'a\nb\nb');
  assert.match(run('abc', ':s/zzz/y/<CR>').message, /E486/);
});

test('visual mode', () => {
  assert.equal(run('abcdef', 'vlld').text(), 'def');
  assert.equal(run('a\nb\nc\nd', 'jVjd').text(), 'a\nd');
  assert.equal(run('a\nb', 'Vj>').text(), '    a\n    b');
  assert.equal(run('    a', '<<').text(), 'a');
  assert.equal(run('a', '>>').text(), '    a');
  assert.equal(run('foo bar', 'wviwd').text(), 'foo ');
  assert.equal(run('foo bar', 'vey$p').text(), 'foo barfoo');
  assert.equal(run('ab\nab\nab', 'Vj:s/a/x/<CR>').text(), 'xb\nxb\nab');
  assert.equal(run('abc', 'vlU').text(), 'ABc');
});

test('ex commands', () => {
  assert.equal(run('a', ':q<CR>').quit, true);
  assert.equal(run('a', ':wq<CR>').written, true);
  assert.equal(run('a', 'ZZ').quit, true);
  assert.match(run('a', ':w<CR>').message, /written/);
  assert.match(run('a', ':bogus<CR>').message, /E492/);
  assert.equal(run('a\nb\nc', ':2d<CR>').text(), 'a\nc');
});

test('Escape cancels pending operators', () => {
  assert.equal(run('abc', 'd<Esc>x').text(), 'bc');
  const v = run('abc', 'd');
  assert.deepEqual(v.pending, ['d']);
});

for (const L of LESSONS) {
  test(`lesson "${L.id}" is solvable by its reference solution`, () => {
    const s = new Session(L);
    assert.equal(s.done, false, 'lesson must not start completed');
    for (const k of parseKeys(L.solution)) {
      assert.ok(s.feed(k), `key ${JSON.stringify(k)} was blocked`);
    }
    assert.ok(s.done, `not complete; text was:\n${s.vim.text()}\ncursor ${s.vim.row},${s.vim.col} mode ${s.vim.mode}`);
  });
}

test('rename practice accepts a selective substitution but not a blanket one', () => {
  const s = new Session(LESSONS.find((l) => l.id === 'rename-calls'));
  for (const k of parseKeys(':%s/warn/alert/g<CR>')) s.feed(k);
  assert.match(s.vim.text(), /example: alert\(\)/);
  assert.equal(s.done, false);
  for (const k of parseKeys('u:2s/warn/alert/<CR>:4,5s/warn/alert/<CR>')) s.feed(k);
  assert.equal(s.done, true);
});

test('lesson ids are unique', () => {
  const ids = LESSONS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('disallowed keys are blocked only as standalone commands', () => {
  const L = LESSONS.find((l) => l.id === 'words');
  const s = new Session(L);
  assert.equal(s.feed('l'), false);
  assert.equal(s.feed('3'), true);
  assert.equal(s.feed('l'), false);
  s.feed('Escape');
  assert.equal(s.feed('f'), true);
  assert.equal(s.feed('l'), true); // "fl" is a find, not a motion
  assert.equal(s.vim.col, 35); // the "l" of lazy
});
