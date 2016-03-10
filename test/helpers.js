'use strict';

const deepFreeze = require('deep-freeze');
const helpers = require('../src/helpers.js');
const laplace = require('coinstac-distributed-algorithm-set').laplace;
const random = require('lodash/random');
const sampleAnalyses1 = require('./stubs/analyses-1.json');
const sampleAnalyses2 = require('./stubs/analyses-2.json');
const sinon = require('sinon');
const tape = require('tape');

/**
 * Sample ROI keys derived from stubs.
 *
 * @type {string[]}
 */
const sampleROIKeys = ['SampleKey1', 'SampleKey2', 'SampleKey3'];
const sampleMVals2 = [
  [0, -1, -2.2],
  [100, 90, 80],
  [0.55, 0.875, 0.1001],
];

/**
 * Get random data for ROI-related testing.
 *
 * @returns {object}
 */
function getRandomROIData() {
  return {
    max: random(0.5, 1, true),
    min: random(0.5),
    sampleSize: random(50, 100),
    epsilon: random(1e-2, 1e-4, true),
  };
}

/**
 * Helper methods should be pure functions. Freeze sample data structures to
 * ensure they're not mutated.
 */
deepFreeze(sampleROIKeys);
deepFreeze(sampleAnalyses1);
deepFreeze(sampleAnalyses2);
deepFreeze(sampleMVals2);

tape('mean', t => {
  t.equals(helpers.mean([1, 15, 22, -3]), 8.75);
  t.end();
});

tape('sum', t => {
  t.equals(helpers.sum([1, 6, -10, 12]), 9, 'regular array');
  t.equals(
    helpers.sum([[1, 2, 3], [4, 5], [6, 7, 8, 9]]),
    45,
    'nested arrays'
  );
  t.end();
});

tape('get objective values', t => {
  t.deepEqual(
    helpers.getObjectiveValues(sampleAnalyses1),
    [[1, 2, 3], [4, 5], [6, 7, 8, 9]]
  );
  t.end();
});

tape('unzip ROI key pairs', t => {
  const one = {
    peaches: 0,
    mangos: 1,
  };
  const two = Math.random();
  const three = {
    raspberry: 0,
    blueberry: 100,
  };
  const obj = {};

  obj[sampleROIKeys[0]] = one;
  obj[sampleROIKeys[1]] = two;
  obj[sampleROIKeys[2]] = three;

  t.deepEqual(
    helpers.unzipRoiKeyPairs(obj, sampleROIKeys),
    [one, two, three]
  );
  t.end();
});

tape('zip ROI key pairs', t => {
  const one = Math.random();
  const two = {
    apples: 0,
    bananas: 100,
  };
  const expected = {};

  expected[sampleROIKeys[0]] = one;
  expected[sampleROIKeys[1]] = two;

  t.deepEqual(
    helpers.zipRoiKeyPairs([one, two], sampleROIKeys.slice(0, 2)),
    expected
  );
  t.end();
});

tape('get gradient values', t => {
  t.deepEqual(
    helpers.getGradientValues(
      [{
        gradient: {
          'Left-Hippocampus': 0.0001337,
          'Right-Hippocampus': 0.80085,
        },
      }, {
        gradient: {
          'Left-Hippocampus': 0.000101,
          'Right-Hippocampus': 0.45,
        },
      }, {
        gradient: {
          'Left-Hippocampus': 0.000361,
          'Right-Hippocampus': 99,
        },
      }],
      ['Right-Hippocampus', 'Left-Hippocampus']
    ),
    [
      [0.80085, 0.0001337],
      [0.45, 0.000101],
      [99, 0.000361],
    ]
  );
  t.end();
});

tape('get mVals', t => {
  t.deepEqual(
    helpers.getMVals(sampleAnalyses2, sampleROIKeys),
    sampleMVals2
  );
  t.end();
});

tape('calculate average', t => {
  const values = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
  const expected = sampleROIKeys.reduce((output, key, index) => {
    // averages of `values` are conveniently in its middle item
    output[key] = values[1][index]; // eslint-disable-line no-param-reassign
    return output;
  }, {});

  deepFreeze(values);

  t.deepEqual(
    helpers.calculateAverage(values, sampleROIKeys),
    expected
  );
  t.end();
});

// This is essentially an average. Pretty simple.
tape('calculate sensitivity', t => {
  const data = getRandomROIData();
  const roi = {
    max: data.max,
    min: data.min,
  };

  deepFreeze(roi);

  t.equal(
    helpers.calculateSensitivity(roi, data.sampleSize),
    (data.max - data.min) / data.sampleSize
  );
  t.end();
});

tape('calculate Laplace scale', t => {
  const data = getRandomROIData();
  const roi = {
    max: data.max,
    min: data.min,
  };

  deepFreeze(roi);

  t.equal(
    helpers.calculateLaplaceScale(roi, data.sampleSize, data.epsilon),
    (data.max - data.min) / data.sampleSize / data.epsilon
  );
  t.end();
});

tape('add noise', t => {
  const data = getRandomROIData();
  const roi = {
    max: data.max,
    min: data.min,
  };
  const value = random(data.max, data.min, true);

  /**
   * `helpers.addNoise` uses coinstac-distributed-algorithm-set’s laplace
   * `noise` method, which produces random noise that's difficult to test.
   * Set up a spy to help out.
   */
  const spy = sinon.spy(laplace, 'noise');

  deepFreeze(roi);

  const actual = helpers.addNoise(value, roi, data.sampleSize, data.epsilon);
  const scale = (data.max - data.min) / data.sampleSize / data.epsilon;

  t.ok(typeof actual === 'number', 'output is a number');
  t.ok(spy.calledWith(scale), 'calls laplace.noise() with correct scale');

  laplace.noise.restore();
  t.end();
});

tape('get ROI values', t => {
  const analyses = sampleAnalyses2.map(a => { // eslint-disable-line arrow-body-style
    return {
      data: a.result.mVals,
    };
  });

  deepFreeze(analyses);

  t.deepEqual(
    helpers.getRoiValues(analyses, sampleROIKeys),
    sampleMVals2
  );
  t.end();
});
