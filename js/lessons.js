// lessons.js — the exercises. Each lesson is plain data:
//   buffer/cursor  starting text and cursor [row, col]
//   expected       finished text (lesson completes when it matches, in NORMAL mode)
//   targets        [[row, col], ...] cells to visit (lesson completes when all are visited)
//   check(vim)     custom completion test
//   disallow       keys that are blocked in NORMAL/VISUAL mode for this lesson
//   setup          keys run before the lesson starts
//   solution       a reference solution (used by the tests and as "par")
(function (root) {
  'use strict';

  const CHAPTERS = ['survival', 'moving faster', 'operators', 'precision', 'search & replace', 'visual mode', 'final challenge'];
  const NO_ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  const NO_HL = ['h', 'l', ...NO_ARROWS];

  function stars(buffer) {
    const out = [];
    buffer.split('\n').forEach((line, r) => {
      for (let c = 0; c < line.length; c++) if (line[c] === '*') out.push([r, c]);
    });
    return out;
  }

  function occurrences(buffer, str) {
    const out = [];
    buffer.split('\n').forEach((line, r) => {
      let i = line.indexOf(str);
      while (i >= 0) { out.push([r, i]); i = line.indexOf(str, i + 1); }
    });
    return out;
  }

  const hjklBuffer = [
    '. . . . . . . . . *',
    '. * . . . . . . . .',
    '. . . . . . . . . .',
    '. . . . . . . * . .',
    '. . * . . . . . . .',
  ].join('\n');

  const findLine = 'print("total: " + price * quantity);';
  const lineEnds = '    return items.filter(item => item.done);';

  const trivia = [
    'vi was written by Bill Joy in 1976.',
    'vim stands for "Vi IMproved".',
    'Bram Moolenaar released vim in 1991.',
    'hjkl came from the ADM-3A terminal,',
    'which printed arrows on those keys.',
    'Its Esc key sat where Tab is today.',
    'That is why Esc feels so far away.',
    'Many people remap Caps Lock to Esc.',
    'vim ships a tutorial called vimtutor.',
    'Neovim forked from vim in 2014.',
    'Every vim command is a little sentence:',
    'verb + noun, like d (delete) + w (word).',
    'Counts multiply: 3dw deletes three words.',
    'The . key repeats your last change.',
    'u undoes, Ctrl-r redoes.',
    'The :help pages are famously good.',
    'Try :help help some day.',
    'vim is charityware.',
    'Almost there...',
    'You found the last line. Nice.',
  ].join('\n');

  const todoBuffer = [
    'function main() {',
    '  loadConfig();',
    '  // TODO: handle missing config',
    '  const db = connect();',
    '  migrate(db);',
    '  // TODO: retry on failure',
    '  serve(db);',
    '}',
    '',
    '// TODO: write tests',
  ].join('\n');

  const LESSONS = [
    // ---------------- chapter 1: survival ----------------
    {
      id: 'insert', chapter: 0, title: 'insert mode',
      body: [
        'vim is modal: keys do different things depending on the mode.',
        'You start in NORMAL mode, where letters are commands, not text.',
        'Press `i` to enter INSERT mode, type, then press `Esc` to go back to NORMAL.',
      ],
      goal: 'Insert the missing word "brown " so the line matches, then press `Esc`.',
      buffer: 'The quick fox jumps over the lazy dog.',
      cursor: [0, 10],
      expected: 'The quick brown fox jumps over the lazy dog.',
      hint: 'The cursor is already on "fox". Type `i`, then `brown ` (with the space), then `Esc`.',
      solution: 'ibrown <Esc>',
    },
    {
      id: 'quit', chapter: 0, title: 'getting out',
      body: [
        'The most-searched vim question of all time: how do I quit?',
        'Press `:` to open the command line at the bottom, type `q`, then press `Enter`.',
        '`:w` writes (saves), `:wq` writes and quits, `:q!` quits and throws away changes.',
      ],
      goal: 'Quit vim.',
      buffer: 'You are trapped in vim.\nThere is exactly one way out.',
      cursor: [0, 0],
      check: (v) => v.quit,
      hint: 'Type `:q` and press `Enter`.',
      solution: ':q<CR>',
    },
    {
      id: 'hjkl', chapter: 0, title: 'h j k l',
      body: [
        'In NORMAL mode `h` `j` `k` `l` move left, down, up and right.',
        'They sit under your right hand, so you never reach for the arrows.',
        'Memory aid: `j` has a hook that points down. Arrow keys are disabled here.',
      ],
      goal: 'Visit every `*`.',
      buffer: hjklBuffer,
      cursor: [2, 8],
      targets: stars(hjklBuffer),
      disallow: NO_ARROWS,
      blockMsg: 'Arrow keys are disabled here: use h j k l',
      hint: '`h` = left, `j` = down, `k` = up, `l` = right. Hold a key to repeat it.',
      solution: 'k' + 'h'.repeat(6) + 'jjj' + 'll' + 'k' + 'l'.repeat(10) + 'kkk' + 'llll',
    },
    {
      id: 'x', chapter: 0, title: 'deleting characters',
      body: [
        '`x` deletes the character under the cursor.',
        'Made a mistake? `u` undoes the last change.',
      ],
      goal: 'Delete the extra letters so the line matches.',
      buffer: 'The ccow jumpedd ovverr the moon.',
      cursor: [0, 0],
      expected: 'The cow jumped over the moon.',
      hint: 'Move onto each extra letter with `h`/`l` and press `x`.',
      solution: 'llllx' + 'l'.repeat(10) + 'x' + 'llx' + 'lllx',
    },

    // ---------------- chapter 2: moving faster ----------------
    {
      id: 'words', chapter: 1, title: 'word motions',
      body: [
        '`w` jumps to the start of the next word, `b` back to the start of a word,',
        '`e` to the end of a word. Uppercase `W` `B` `E` count anything non-blank as part of the word.',
        'Every motion takes a count: `3w` jumps three words.',
      ],
      goal: 'Visit every highlighted letter using word motions (`h` and `l` are disabled).',
      buffer: 'the quick brown fox jumps over the lazy dog',
      cursor: [0, 0],
      targets: [[0, 4], [0, 16], [0, 29]],
      disallow: NO_HL,
      blockMsg: 'h and l are disabled here: use w b e',
      hint: '`w` lands on the "q" of quick. `e` lands on the last letter of a word.',
      solution: 'wwwwwe',
    },
    {
      id: 'line-ends', chapter: 1, title: 'start and end of line',
      body: [
        '`0` goes to the very first column, `^` to the first non-blank character,',
        'and `$` to the end of the line.',
      ],
      goal: 'Visit the first column, the first non-blank character and the last character.',
      buffer: lineEnds,
      cursor: [0, 15],
      targets: [[0, 0], [0, 4], [0, lineEnds.length - 1]],
      disallow: [...NO_HL, 'w', 'b', 'e', 'W', 'B', 'E'],
      blockMsg: 'Use 0, ^ and $ for this one',
      hint: 'Press `^`, then `$`, then `0`.',
      solution: '^$0',
    },
    {
      id: 'file-ends', chapter: 1, title: 'top, bottom, line N',
      body: [
        '`gg` jumps to the first line, `G` to the last one.',
        'Type a number first to jump to that line: `12G` (or `:12` then `Enter`).',
      ],
      goal: 'Visit line 1, line 12 and the last line (`j` and `k` are disabled).',
      buffer: trivia,
      cursor: [8, 0],
      targets: [[0, 0], [11, 0], [19, 0]],
      disallow: ['j', 'k', ...NO_ARROWS],
      blockMsg: 'j and k are disabled here: use gg, G and 12G',
      hint: 'Try `gg`, then `G`, then `12G`.',
      solution: 'ggG12G',
    },
    {
      id: 'append', chapter: 1, title: 'A and I',
      body: [
        '`A` appends at the end of the line. `I` inserts before the first non-blank character.',
        'Both drop you into INSERT mode, wherever the cursor happens to be on the line.',
      ],
      goal: 'Turn the three lines into the target below.',
      buffer: 'a = 1\nb = 2\nconsole.log(a + b)',
      cursor: [0, 0],
      expected: 'let a = 1;\nlet b = 2;\nconsole.log(a + b);',
      hint: 'On each line: `Ilet <Esc>`, then `A;<Esc>`, then `j` to go down.',
      solution: 'Ilet <Esc>A;<Esc>jIlet <Esc>A;<Esc>jA;<Esc>',
    },
    {
      id: 'open', chapter: 1, title: 'opening lines',
      body: [
        '`o` opens a new line below the cursor and enters INSERT mode. `O` opens one above.',
      ],
      goal: 'Add the header line and the "- eggs" line.',
      buffer: '- milk\n- bread',
      cursor: [0, 0],
      expected: '# shopping list\n- milk\n- eggs\n- bread',
      hint: '`O# shopping list<Esc>`, then `j` and `o- eggs<Esc>`.',
      solution: 'O# shopping list<Esc>jo- eggs<Esc>',
    },

    // ---------------- chapter 3: operators ----------------
    {
      id: 'dw', chapter: 2, title: 'operator + motion',
      body: [
        'vim commands read like sentences: an operator (a verb) plus a motion (a noun).',
        '`d` is delete, so `dw` means "delete word" and `d$` means "delete to the end of the line".',
      ],
      goal: 'Delete the duplicated words.',
      buffer: 'This sentence has has some extra extra words words in it.',
      cursor: [0, 0],
      expected: 'This sentence has some extra words in it.',
      hint: 'Use `w` to reach a duplicate, then `dw`.',
      solution: 'wwdwwwdwwdw',
    },
    {
      id: 'dd', chapter: 2, title: 'lines and counts',
      body: [
        'Press an operator twice to apply it to the whole line: `dd` deletes the line.',
        'Counts work here too: `3dd` deletes three lines, `d2w` deletes two words.',
      ],
      goal: 'Delete every "DELETE ME" line.',
      buffer: 'keep this line\nDELETE ME\nkeep this line too\nDELETE ME\nDELETE ME\nDELETE ME\nthe end',
      cursor: [0, 0],
      expected: 'keep this line\nkeep this line too\nthe end',
      hint: '`j` `dd` removes the first one. For the block of three, try `3dd`.',
      solution: 'jddj3dd',
    },
    {
      id: 'change', chapter: 2, title: 'change',
      body: [
        '`c` is the change operator: it deletes, then drops you into INSERT mode.',
        '`cw` changes to the end of the word. `C` (same as `c$`) changes to the end of the line.',
      ],
      goal: 'Fix both lines.',
      buffer: 'I love using nano to edit text files.\nThe end of this line is all wrong, totally wrong',
      cursor: [0, 0],
      expected: 'I love using vim to edit text files.\nThe end of this line is fine.',
      hint: 'Go to "nano" and type `cwvim<Esc>`. On line 2, go to "all" and type `Cfine.<Esc>`.',
      solution: 'wwwcwvim<Esc>j06wCfine.<Esc>',
    },
    {
      id: 'yank', chapter: 2, title: 'yank and put',
      body: [
        '`y` is the yank (copy) operator: `yy` yanks the whole line.',
        '`p` puts (pastes) it after the cursor, `P` puts it before.',
      ],
      goal: 'Duplicate the console.log line.',
      buffer: 'function greet() {\n  console.log("hello");\n}',
      cursor: [0, 0],
      expected: 'function greet() {\n  console.log("hello");\n  console.log("hello");\n}',
      hint: '`j` to the line, `yy`, then `p`.',
      solution: 'jyyp',
    },
    {
      id: 'swap', chapter: 2, title: 'moving lines',
      body: [
        'Deleting also yanks, so `dd` + `p` moves a line down by one.',
        '`ddp` is a classic idiom for swapping two lines.',
      ],
      goal: 'Put the morning routine in order.',
      buffer: '2. brush teeth\n1. wake up\n3. drink coffee',
      cursor: [0, 0],
      expected: '1. wake up\n2. brush teeth\n3. drink coffee',
      hint: 'On the first line, type `ddp`.',
      solution: 'ddp',
    },
    {
      id: 'undo', chapter: 2, title: 'undo and redo',
      body: [
        'Somebody deleted two lines of this file. Oops.',
        '`u` undoes the last change; press it again to go further back. `Ctrl-r` redoes.',
      ],
      goal: 'Get all three lines back.',
      buffer: 'Undo is your safety net.\nNothing you do in vim is permanent\nuntil you close the file.',
      setup: 'dddd',
      cursor: [0, 0],
      expected: 'Undo is your safety net.\nNothing you do in vim is permanent\nuntil you close the file.',
      hint: 'Press `u` twice.',
      solution: 'uu',
    },

    // ---------------- chapter 4: precision ----------------
    {
      id: 'find', chapter: 3, title: 'find on a line',
      body: [
        '`f` + a character jumps forward onto the next occurrence of it on the line. `F` searches backward.',
        '`t` jumps "till": it stops just before the character. `;` repeats the last f/t, `,` reverses it.',
      ],
      goal: 'Visit the `:`, the `*` and the `;` (word motions are disabled).',
      buffer: findLine,
      cursor: [0, 0],
      targets: [[0, findLine.indexOf(':')], [0, findLine.indexOf('*')], [0, findLine.indexOf(';')]],
      disallow: [...NO_HL, 'w', 'b', 'e', 'W', 'B', 'E', '$'],
      blockMsg: 'Use f, t, ; and , for this one',
      hint: '`f:` then `f*` then `f;`.',
      solution: 'f:f*f;',
    },
    {
      id: 'delete-till', chapter: 3, title: 'operators + find',
      body: [
        'Any motion works after an operator, including f and t.',
        '`dt.` deletes everything up to (not including) the next ".". `cf,` changes through the next comma.',
      ],
      goal: 'Cut the sentence after "times".',
      buffer: 'It was the best of times, it was the worst of times.',
      cursor: [0, 0],
      expected: 'It was the best of times.',
      hint: '`f,` to jump to the comma, then `dt.`.',
      solution: 'f,dt.',
    },
    {
      id: 'replace', chapter: 3, title: 'r and ~',
      body: [
        '`r` + a character replaces the character under the cursor, without entering INSERT mode.',
        '`~` toggles the case of the character under the cursor and moves right.',
      ],
      goal: 'Fix the capitals and the year.',
      buffer: 'vim was released in 1981 by bram moolenaar.',
      cursor: [0, 0],
      expected: 'Vim was released in 1991 by Bram Moolenaar.',
      hint: '`~` on the first "v". `f8r9` fixes the year. `fb;` jumps to "bram" (`;` repeats the find).',
      solution: '~f8r9fb;~fm;~',
    },
    {
      id: 'text-objects', chapter: 3, title: 'text objects',
      body: [
        'After an operator you can also use a text object: `iw` = inner word, `i"` = inside quotes, `i(` = inside parens.',
        '`aw`, `a"` and `a(` also take the surrounding space or delimiters.',
        'The cursor can be anywhere inside the object. `ci"` even jumps forward to the next quotes.',
      ],
      goal: 'Change both `const` to `let` and "World" to "Vim".',
      buffer: 'const name = "World";\nconst greeting = "Hello, " + name;',
      cursor: [0, 2],
      expected: 'let name = "Vim";\nlet greeting = "Hello, " + name;',
      hint: '`ciwlet<Esc>`, then `ci"Vim<Esc>`, then go to line 2 and `ciwlet<Esc>` again.',
      solution: 'ciwlet<Esc>ci"Vim<Esc>j0ciwlet<Esc>',
    },
    {
      id: 'dot', chapter: 3, title: 'the dot command',
      body: [
        '`.` repeats your last change, including whatever you typed in INSERT mode.',
        'Make a change once, then move and press `.` to make it again.',
      ],
      goal: 'Change every `var` to `let`.',
      buffer: 'var x = 1;\nvar y = 2;\nvar z = 3;\nvar w = 4;',
      cursor: [0, 0],
      expected: 'let x = 1;\nlet y = 2;\nlet z = 3;\nlet w = 4;',
      hint: '`ciwlet<Esc>` once, then `j.` three times.',
      solution: 'ciwlet<Esc>j.j.j.',
    },
    {
      id: 'percent', chapter: 3, title: 'matching brackets',
      body: [
        '`%` jumps between matching (), [] and {}.',
        'Combine it with an operator: `d%` deletes a whole bracketed group.',
      ],
      goal: 'Delete the arguments, parentheses included.',
      buffer: 'result = compute(alpha, beta(gamma)) + 1;',
      cursor: [0, 0],
      expected: 'result = compute + 1;',
      hint: '`f(` to reach the first parenthesis, then `d%`.',
      solution: 'f(d%',
    },

    // ---------------- chapter 5: search & replace ----------------
    {
      id: 'search', chapter: 4, title: 'search',
      body: [
        '`/` + text + `Enter` searches forward. `?` searches backward.',
        '`n` jumps to the next match, `N` to the previous one.',
      ],
      goal: 'Visit every TODO (`j` and `k` are disabled).',
      buffer: todoBuffer,
      cursor: [0, 0],
      targets: occurrences(todoBuffer, 'TODO'),
      disallow: ['j', 'k', '{', '}', 'G', ...NO_ARROWS],
      blockMsg: 'Use / and n for this one',
      hint: 'Type `/TODO` and press `Enter`, then press `n` twice.',
      solution: '/TODO<CR>nn',
    },
    {
      id: 'substitute', chapter: 4, title: 'substitute',
      body: [
        '`:s/old/new/` replaces the first match on the current line.',
        'Add the `g` flag to replace every match on the line. Put `%` in front to do it on every line:',
        '`:%s/old/new/g`',
      ],
      goal: 'Americanize the spelling of "colour" everywhere.',
      buffer: 'The colour of the sky.\nMy favourite colour is blue, the colour of calm.\ncolour colour colour',
      cursor: [0, 0],
      expected: 'The color of the sky.\nMy favourite color is blue, the color of calm.\ncolor color color',
      hint: 'Type `:%s/colour/color/g` and press `Enter`.',
      solution: ':%s/colour/color/g<CR>',
    },

    // ---------------- chapter 6: visual mode ----------------
    {
      id: 'visual', chapter: 5, title: 'visual mode',
      body: [
        '`v` starts selecting characters, `V` selects whole lines. Move to grow the selection.',
        'Then apply an operator: `d` deletes, `y` yanks, `c` changes. `Esc` cancels.',
      ],
      goal: 'Remove the two middle lines using visual mode.',
      buffer: 'keep this line\nremove this line\nremove this one too\nkeep this line',
      cursor: [1, 0],
      expected: 'keep this line\nkeep this line',
      hint: '`V` to select the line, `j` to extend the selection, `d` to delete it.',
      solution: 'Vjd',
    },
    {
      id: 'indent', chapter: 5, title: 'indenting',
      body: [
        '`>` shifts lines right and `<` shifts them left (shiftwidth is 4 here).',
        'In NORMAL mode `>>` shifts one line. In VISUAL mode, select the lines and press `>`.',
      ],
      goal: 'Indent the body of the function.',
      buffer: 'function hello() {\nconsole.log("hi");\nreturn 42;\n}',
      cursor: [0, 0],
      expected: 'function hello() {\n    console.log("hi");\n    return 42;\n}',
      hint: '`j`, then `Vj>`. Or `>>` on each line.',
      solution: 'jVj>',
    },

    // ---------------- chapter 7: final challenge ----------------
    {
      id: 'final', chapter: 6, title: 'debug this',
      body: [
        'Everything you have learned, together. There are three bugs:',
        '`add` subtracts, `multiply` adds, and the last line calls the wrong function.',
        'Try to beat par.',
      ],
      goal: 'Fix all three bugs.',
      buffer: [
        'function add(a, b) {',
        '  return a - b;',
        '}',
        '',
        'function multiply(a, b) {',
        '  return a + b;',
        '}',
        '',
        'console.log(add(2, 2));',
        'console.log(add(3, 4));',
      ].join('\n'),
      cursor: [0, 0],
      expected: [
        'function add(a, b) {',
        '  return a + b;',
        '}',
        '',
        'function multiply(a, b) {',
        '  return a * b;',
        '}',
        '',
        'console.log(add(2, 2));',
        'console.log(multiply(3, 4));',
      ].join('\n'),
      hint: '`r` fixes single characters. `G` jumps to the last line, and `ciw` changes a word.',
      solution: 'jf-r+4j0f+r*Gfaciwmultiply<Esc>',
    },
  ];

  const api = { LESSONS, CHAPTERS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root.HJKL || (root.HJKL = {}), api);
})(typeof window !== 'undefined' ? window : globalThis);
