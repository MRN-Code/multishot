'use strict';

const _ = require('lodash');
const coinstacAlgorithms = require('coinstac-distributed-algorithm-set');
const helpers = require('./helpers.js');
const numeric = require('numeric');

/**
 * Compute regression on the client.
 *
 * @param {array} xVals ?
 * @param {array} yVals ?
 * @param {array} aggregateMVals ?
 * @param {string[]} roiKeys Targetted predictors
 * @returns {object}
 */
function computeRegression(xVals, yVals, aggregateMVals, roiKeys) {
  // @TODO dep vars (control/patient) must have both types
  const normalizedYVals = coinstacAlgorithms.utils.normalize(yVals);
  const normalizedXVals = coinstacAlgorithms.utils.normalize(xVals);
  const objectiveScore = coinstacAlgorithms.ridgeRegression.objective(
    aggregateMVals,
    normalizedXVals,
    normalizedYVals
  );
  const predictedYVals = coinstacAlgorithms.ridgeRegression.applyModel(
    aggregateMVals,
    normalizedXVals
  );
  const gradient = coinstacAlgorithms.ridgeRegression.gradient(
    aggregateMVals,
    normalizedXVals,
    normalizedYVals
  );

  return {
    gradient: _.zipObject(roiKeys, gradient),
    objective: coinstacAlgorithms.ridgeRegression.objective(
      aggregateMVals,
      normalizedXVals,
      normalizedYVals
    ),
    previousAggregateMVals: aggregateMVals,
    r2: coinstacAlgorithms.utils.r2(normalizedXVals, predictedYVals),
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
