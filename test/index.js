'use strict';

const multishot = require('../src/index.js');
const tape = require('tape');

tape('exports expected format', t => {
  t.ok(multishot.name, 'has name');
  t.ok(multishot.version, 'has version');
  t.ok(
    Array.isArray(multishot.local) || multishot.local instanceof Object,
    'has local'
  );
  t.ok(
    Array.isArray(multishot.remote) || multishot.remote instanceof Object,
    'has remote'
  );
  t.end();
});
