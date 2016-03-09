'use strict';

const _ = require('lodash');
const Analysis = require('../lib/analysis.js');
const analysisRunners = require('../lib/analysis-runners.js');
const deepFreeze = require('deep-freeze');
const sampleAnalyses1 = require('./stubs/analyses-1.json');
const sampleAnalyses3 = require('./stubs/analyses-3.json');
const test = require('tape');

const runSingleShot = analysisRunners.runSingleShot;
const runMultiShot = analysisRunners.runMultiShot;

/**
 * Construct an aggregate document for testing.
 *
 * @param {Analysis} analysis
 * @param {object} options
 * @param {number} [options.clientCount=3]
 * @param {number} [options.lambda=0.7]
 * @param {number} [options.learningRate=1e-8]
 * @param {number} [options.maxIterations=200]
 * @returns {object}
 */
function getAggregateDocument(analysis, options) {
  if (!(analysis instanceof Analysis)) {
    throw new Error();
  }
  if (typeof options === 'undefined') {
    options = {}; // eslint-disable-line no-param-reassign
  }

  const clientCount = options.clientCount || 3;
  const lambda = options.lambda || 0.7;
  const learningRate = options.learningRate || 1e-8;
  const maxIterations = options.maxIterations || 200;
  const aggregateDocument = {
    aggregate: true,
    clientCount: clientCount, // eslint-disable-line object-shorthand
    contributors: [],
    data: {
      gradient: {},
      learningRate: learningRate, // eslint-disable-line object-shorthand
      mVals: {},
      objective: Infinity,
      r2: 0,
    },
    error: null,
    files: [],
    history: [],
    iterate: true,
    lambda: lambda, // eslint-disable-line object-shorthand
    maxIterations: maxIterations, // eslint-disable-line object-shorthand
    previousBestFit: {},
  };

  analysis.getRoiKeys().forEach(key => {
    aggregateDocument.data.mVals[key] = Math.random();
    aggregateDocument.data.gradient[key] = 0;
  });

  return aggregateDocument;
}

test('single shot errors', t => {
  t.throws(runSingleShot, 'throws with no arguments');
  t.throws(
    runSingleShot.bind(null, new Analysis()),
    'throws with missing analyses docs'
  );
  t.throws(
    runSingleShot.bind(null, new Analysis(), []),
    'throws with empty analyses docs array'
  );
  t.end();
});

test('single shot results', t => {
  const myAnalysis = new Analysis({
    roiMeta: {
      'Left-Hippocampus': {
        min: 0,
        max: 1,
      },
    },
  });
  const results = runSingleShot(myAnalysis, [{
    data: {
      'Left-Hippocampus': Math.random(),
    },
  }, {
    data: {
      'Left-Hippocampus': Math.random(),
    },
  }, {
    data: {
      'Left-Hippocampus': Math.random(),
    },
  }]);

  t.ok(results, 'has results');
  t.end();
});

test('multi-shot errors', t => {
  t.throws(runMultiShot, 'throws with no arguments');
  t.throws(
    runMultiShot.bind(null, new Analysis()),
    'throws with missing analyses docs'
  );
  t.throws(
    runMultiShot.bind(null, new Analysis(), []),
    'throws with empty analyses docs array'
  );
  t.throws(
    runMultiShot.bind(null, new Analysis(), [0, 1, 2]),
    'throws with missing aggregate doc'
  );
  t.end();
});

test('multi-shot gets a document', t => {
  const analysis = new Analysis();
  const aggregateDoc = getAggregateDocument(analysis);
  const result = runMultiShot(analysis, sampleAnalyses1, aggregateDoc);

  t.ok(result instanceof Object, 'returns a doc');
  t.end();
});

test('multi-shot changes aggregate properties', t => {
  const analysis = new Analysis({
    roiMeta: {
      'Left-Hippocampus': {
        min: 0,
        max: 0,
      },
    },
  });
  const aggregateDoc = getAggregateDocument(analysis);
  const result = runMultiShot(analysis, sampleAnalyses1, aggregateDoc);
  // const roiKeys = analysis.getRoiKeys();

  t.notDeepEqual(
    aggregateDoc.data.gradient,
    result.data.gradient,
    'calculates new gradient'
  );
  t.ok(
    'Left-Hippocampus' in result.data.gradient,
    'new gradient maintains ROI'
  );

  t.ok('Left-Hippocampus' in result.data.mVals, 'new mVals maintains ROI');

  t.notEqual(
    aggregateDoc.data.objective,
    result.data.objective,
    'calculates new objective'
  );
  t.ok(_.isFinite(result.data.objective), 'new objective is a number');

  t.notEqual(aggregateDoc.data.r2, result.data.r2, 'calculates new r2');
  t.ok(_.isFinite(result.data.r2), 'new r2 is a number');

  t.end();
});


/**
 * The multi-shot analysis should maintain history of past iterations in the
 * aggregate document. Ensure it's doing its job.
 */
test('multi-shot builds aggregate history', t => {
  const analysis = new Analysis({
    roiMeta: {
      'Left-Hippocampus': {
        min: 0,
        max: 0,
      },
    },
  });
  const firstAggregateDoc = getAggregateDocument(analysis);
  const aggregateDocs = [];

  deepFreeze(firstAggregateDoc);
  aggregateDocs.push(firstAggregateDoc);

  /**
   * Each iteration is tested separately because arguments are maintained in
   * an object (@see getSpyWrappedAggregateDocument). `spy#firstCall`,
   * `spy#secondCall`, etc. have argument pointers inside this object, making
   * them useless.
   */
  for (var i = 1, newAggregateDoc, j; i <= 3; i++) { // eslint-disable-line
    newAggregateDoc = runMultiShot(
      analysis,
      sampleAnalyses1,
      aggregateDocs[i - 1]
    );
    deepFreeze(newAggregateDoc);
    aggregateDocs.push(newAggregateDoc);

    t.notDeepEqual(
      aggregateDocs[i].history,
      aggregateDocs[i - 1].history,
      `changes history on iteration ${i}`
    );
    t.equal(
      aggregateDocs[i].history.length,
      i,
      `iteration ${i} adds doc to history`
    );
    t.deepEqual(
      _.last(aggregateDocs[i].history),
      aggregateDocs[i].data,
      `saves iteration ${i}’s history`
    );
  }

  t.ok(
    aggregateDocs.slice(-1).pop().history.every(doc => !('history' in doc)),
    'doesn’t recursively save history'
  );

  t.end();
});

test('resets contributors array', t => {
  const analysis = new Analysis();
  const aggregateDoc = getAggregateDocument(analysis);
  aggregateDoc.contributors = [1, 2, 3];

  const result = runMultiShot(analysis, sampleAnalyses1, aggregateDoc);

  t.equal(result.contributors.length, 0, 'array length is 0');
  t.end();
});

/**
 * Analysis should stop iterating when the square root of the sums of the
 * squares of the analyses documents' gradients is greater than or equal to the
 * analysis's tolerance. The 'Left-Hippocampus' gradients in `sampleAnalysis3`
 * are boosted to `100` to ensure trigger the aggregate stops.
 *
 * @see analysisRunners#runMultiShot
 */
test('multi-shot stops iterating when tolerance reached', t => {
  const analysis = new Analysis({
    roiMeta: {
      'Left-Hippocampus': {
        min: 0,
        max: 1,
      },
    },
    tolerance: 1e-3,
  });

  const aggregateDoc1 = getAggregateDocument(analysis);
  t.ok(aggregateDoc1.iterate, 'iterate initially on');

  const aggregateDoc2 = runMultiShot(
    analysis,
    sampleAnalyses1,
    aggregateDoc1
  );
  t.ok(aggregateDoc2.iterate, 'iterate on after first pass');

  const aggregateDoc3 = runMultiShot(
    analysis,
    sampleAnalyses3,
    aggregateDoc2
  );
  t.notOk(aggregateDoc3.iterate, 'iterate off after second pass');

  t.end();
});

/**
 * An aggregate's learning rate should be adjusted when its current objective is
 * greater than its last objective.
 */
test('multi-shot adjusts learning rate', t => {
  const analysis = new Analysis();
  const aggregateDocs = [getAggregateDocument(analysis, {
    learningRate: 1e-4,
  })];

  function doMultiShot(analysesDocs) {
    aggregateDocs.push(
      runMultiShot(analysis, analysesDocs, _.last(aggregateDocs))
    );
    t.ok(
      _.isFinite(_.last(aggregateDocs).data.learningRate),
      `iteration ${aggregateDocs.length} learning rate is a number`
    );
  }

  doMultiShot(sampleAnalyses1);

  t.equal(
    _.head(aggregateDocs.slice(-2)).data.learningRate,
    _.last(aggregateDocs).data.learningRate,
    'iteration 2 duplicates learning rate'
  );

  doMultiShot(sampleAnalyses3);

  t.equal(
    _.last(aggregateDocs).data.learningRate,
    _.head(aggregateDocs.slice(-2)).data.learningRate / 2,
    'iteration 3 duplicates learning rate'
  );

  t.end();
});
