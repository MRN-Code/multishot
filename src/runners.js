'use strict';

const _ = require('lodash');
const coinstacAlgorithms = require('coinstac-distributed-algorithm-set');
const helpers = require('./helpers.js');
const numeric = require('numeric');

/**
 * Compute regression on the client.
 *
 * @example
 * computeRegression(
 *   [[100, 200], [101, 201], [102, 202], [103, 203], [104, 204]],
 *   [[300, 400], [301, 401], [302, 402], [303, 403], [304, 404]],
 *   [0.123, 0.456],
 *   ['Left-Hippocampus', 'Right-Hippocampus']
 * );
 *
 * @todo  The underlying COINSTAC algorithms ridge regression doesn't appear to
 * accept 2-dimensional arrays. Thus, `xVals` and `yVals` need to be
 * 1-dimensional.
 *
 * @param {array[]} xVals Predictors
 * @param {array[]} yVals Dependent variables
 * @param {number[]} aggregateMVals ?
 * @param {string[]} roiKeys Targetted predictors
 * @returns {object}
 */
function computeRegression(xVals, yVals, aggregateMVals, roiKeys) {
  // `normalize` accepts 1-dim or 2-dim array
  const normalizedXVals = coinstacAlgorithms.utils.normalize(xVals);
  const normalizedYVals = coinstacAlgorithms.utils.normalize(yVals);

  const gradient = coinstacAlgorithms.ridgeRegression.gradient(
    aggregateMVals,  // {array} M Vals
    normalizedXVals, // {array} 2-dim array of X Vals
    normalizedYVals  // {array} yVals
  );

  // `applyModel` returns a number. `predictedYVals` should be a number.
  const predictedYVals = coinstacAlgorithms.ridgeRegression.applyModel(
    aggregateMVals, // {array} M Vals
    normalizedXVals // {array} X Vals
  );

  return {
    gradient: _.zipObject(roiKeys, gradient),
    objective: coinstacAlgorithms.ridgeRegression.objective(
      aggregateMVals,  // {array} of M Vals
      normalizedXVals, // {array} 2-dim array of X Vals
      normalizedYVals  // {array} 1-dim ??? array of Y Vals
    ),

    // `previousAggregateMVals` is used to determine whether remote should run
    previousAggregateMVals: aggregateMVals,
    r2: coinstacAlgorithms.utils.r2(
      normalizedYVals, // {number[]} sampleData 1-dim array
      predictedYVals   // {number} modelData (should be a number?)
    ),
  };
}

/**
 * Compute aggregate.
 *
 * Run a differentially private average of the analyses.
 *
 * @param {Object} previousRemoteResult Previous remote result
 * @param {Object[]} localResults Collection of local (client) results
 * @param {number} tolerance
 * @param {string[]} roiKeys Freesurfer region-of-interest keys
 */
function computeAggregate(
  previousRemoteResult,
  localResults,
  tolerance,
  roiKeys
) {
  const aggregateObjective =
    helpers.sum(helpers.getObjectiveValues(localResults));
  const aggregateGradient = coinstacAlgorithms.utils.columnWiseSum(
    helpers.getGradientValues(localResults, roiKeys)
  );
  const gradient = helpers.zipRoiKeyPairs(aggregateGradient, roiKeys);
  let learningRate = previousRemoteResult.learningRate;
  const previousBestFit = previousRemoteResult.previousBestFit;
  let bestFit;

  /**
   * Stop iterating if the gradient falls below the tolerance. This returns the
   * “stop” symbol, which indicates to the controlling method to kill the
   * computation.
   */
  if (numeric.norm2(helpers.unzipRoiKeyPairs(gradient, roiKeys)) < tolerance) {
    return computeAggregate.STOP;
  }

  /**
   * Aim for a low objective. If this iteration's objective is higher then
   * adjust the learning rate. Gradient stays the same.
   */
  if (aggregateObjective > previousBestFit.objective) {
    learningRate /= 2;
    bestFit = previousBestFit;
  } else {
    // Newer, better fit
    bestFit = {
      gradient: previousRemoteResult.gradient,
      mVals: previousRemoteResult.mVals,
      objective: previousRemoteResult.objective,
    };
  }

  return {
    /* eslint-disable object-shorthand */
    gradient: gradient,
    iterationCount: previousRemoteResult.iterationCount + 1,
    learningRate: learningRate,
    /* eslint-enable object-shorthand */

    // Still recalculate MVals with the previous best fit's data
    mVals: helpers.zipRoiKeyPairs(
      coinstacAlgorithms.ridgeRegression.recalculateMVals(
        learningRate,
        helpers.unzipRoiKeyPairs(previousBestFit.mVals, roiKeys),
        helpers.unzipRoiKeyPairs(previousBestFit.gradient, roiKeys)
      ),
      roiKeys
    ),
    objective: aggregateObjective,
    previousBestFit: bestFit,
    r2: helpers.mean(localResults.map(result => result.r2)),
  };
}

/**
 * @type {Symbol}
 */
computeAggregate.STOP = Symbol('computeAggregate STOP');

module.exports = {
  /* eslint-disable object-shorthand */
  computeAggregate: computeAggregate,
  computeRegression: computeRegression,
  /* eslint-enable object-shorthand */
};
