'use strict';

const runners = require('../src/runners.js');
const sampleAnalyses3 = require('./stubs/analyses-3.json');
const tape = require('tape');

tape('computes basic regression', t => {
  const regression = runners.computeRegression(
    [100, 200, 300],
    [400, 500, 600],
    [0.123, 0.456],
    ['Left-Hippocampus', 'Right-Hippocampus']
  );
  t.ok(regression, 'computes it');
  t.end();
});

tape('computes basic aggregate', t => {
  const aggregate = runners.computeAggregate(
    {
      gradient: {
        'Left-Hippocampus': 0.123,
      },
      iterationCount: 10,
      learningRate: 0.7,
      mVals: {
        'Left-Hippocampus': 0.123,
      },
      objective: 3001,
      previousBestFit: {
        gradient: {
          'Left-Hippocampus': 0.123,
        },
        mVals: {
          'Left-Hippocampus': 0.123,
        },
        objective: 3000,
      },
      r2: 1.234567e-9,
    },
    sampleAnalyses3,
    1e-5,
    ['Left-Hippocampus']
  );
  t.ok(aggregate, 'computes it');
  t.end();
});
