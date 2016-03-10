/**
 * Analysis helpers.
 *
 * Helper functions for running an analysis. They're mostly pure functions.
 */

'use strict';

const _ = require('lodash');
const async = require('async');
const coinstacAlgorithms = require('coinstac-distributed-algorithm-set');
const Freesurfer = require('freesurfer-parser');
const fs = require('fs');
const laplace = coinstacAlgorithms.laplace;

/**
 * Sum.
 *
 * @param {number[]} values
 * @returns {number}
 */
function sum(values) {
  return _.flatten(values).reduce((all, number) => all + number);
}

/**
 * Mean.
 *
 * @param {number[]} values
 * @returns {number}
 */
function mean(values) {
  const count = values.length;

  if (!count) {
    return 0;
  }

  return sum(values) / count;
}

/**
 * Get objective function results from each analysis.
 *
 * @param {object[]} analyses array of analysis documents
 * @returns {array} array of objective results
 */
function getObjectiveValues(analyses) {
  return _.map(analyses, _.property('data.objective'));
}

/**
 * Extract values from object in same order as roiMeta.
 *
 * @param {object} obj object where keys are roi labels
 * @param {string[]} roiKeys Collection of region of interest keys
 * @returns {array} array of values in the same order as roiMeta
 */
function unzipRoiKeyPairs(obj, roiKeys) {
  return _.map(roiKeys, key => obj[key]);
}

/**
 * Combine values with roi labels.
 *
 * @param {array} values array of values in same order as roiMeta
 * @param {string[]} roiKeys Collection of region of interest keys
 * @returns {object} object with keys from roiMeta and values from array
 */
function zipRoiKeyPairs(values, roiKeys) {
  return _.zipObject(roiKeys, values);
}

/**
 * Get gradient function results from each analysis.
 *
 * @param {array} analyses array of analysis documents
 * @param {string[]} roiKeys Collection of region of interest keys
 * @returns {array} array of gradient results, ordered according to roiKeys
 */
function getGradientValues(analyses, roiKeys) {
  return analyses
    .map(a => a.gradient)
    .map(values => unzipRoiKeyPairs(values, roiKeys));
}

/**
 * Get array of ROI values from each analysis. Values will be in the same order
 * as internals.roiMeta.
 * Also validates that all ROIs are present and numeric in each analysis
 *
 * @param {object[]} analyses array of analysis objects with result and owner prop
 * @param {string[]} roiKeys Collection of region of interest keys
 * @returns {array} two dim array of ROI values for each site
 */
function getMVals(analyses, roiKeys) {
  return _.map(analyses, _.property('result.mVals'))
    .map(values => unzipRoiKeyPairs(values, roiKeys));
}

/**
 * Calculate average values for each ROIs
 * Assumes that the order within each 'row' of values is the same as the order
 * of internals.roiMeta
 *
 * @param {array} values two dimensional array of roi values for each site
 * @param {string[]} roiKeys Collection of region of interest keys
 * @returns {object}     {roi1: average1, roi2: average2}
 */
function calculateAverage(values, roiKeys) {
  // TODO: these keys should be defined in the consortium or analysis
  const resultVector = coinstacAlgorithms.utils.columnWiseAverage(values);
  const resultObj = zipRoiKeyPairs(resultVector, roiKeys);
  return resultObj;
}

/**
 * Calculate the sensitivity of the average of the ROI.
 *
 * @param {object} roi Region of interest object
 * @param {number} roi.min
 * @param {number} roi.max
 * @param  {number} sampleSize Number of samples on which the value was computed
 * @return {number} Sensitivity of the average
 */
function calculateSensitivity(roi, sampleSize) {
  return (roi.max - roi.min) / sampleSize;
}

/**
 * Calculate the scale of a Laplace CDF from which to draw noise returns the
 * value of varible `b` in the inverse CDF function found at
 * {@link https://en.wikipedia.org/wiki/Laplace_distribution}.
 *
 * @param {object} roi Region of interest object
 * @param {number} roi.min
 * @param {number} roi.max
 * @param {number} sampleSize Number of samples on which the value was computed
 * @param {number} epsilon
 * @returns {number} Scale of the CDF
 */
function calculateLaplaceScale(roi, sampleSize, epsilon) {
  return calculateSensitivity(roi, sampleSize) / epsilon;
}

/**
 * Add Laplace noise to the average value of the ROI.
 *
 * @param {number} value The value of the ROI average
 * @param {object} roi Region of interest object
 * @param {number} roi.min
 * @param {number} roi.max
 * @param {number} sampleSize Number of samples on which the value was computed
 * @param {number} epsilon
 * @returns {number} The value with noise added
 */
function addNoise(value, roi, sampleSize, epsilon) {
  const scale = calculateLaplaceScale(roi, sampleSize, epsilon);
  return value + laplace.noise(scale);
}

/**
 * Get array of ROI values from each analysis.
 *
 * Values will be in the same order as `roiKeys`. Also validates that all ROIs
 * are present and numeric in each analysis.
 *
 * @param {object[]} analyses array of analysis objects with result and owner prop
 * @param {string[]} roiKeys Collection of region of interest keys
 * @returns {array} two dim array of ROI values for each site
 */
function getRoiValues(analyses, roiKeys) {
  return analyses.map(analysis => {
    const roiObj = analysis.data;
    const username = analysis.username;

    return roiKeys.map(key => {
      if (_.isUndefined(roiObj[key])) {
        throw new Error(
          `ROI '${key}' not found in ${username}'s dataset`
        );
      }
      if (!_.isNumber(roiObj[key])) {
        throw new Error(
          `Nonnumeric value for '${key}' in ${username}'s data`
        );
      }

      return roiObj[key];
    });
  });
}

/**
 * Get a remote result seed based.
 *
 * @param {Object} options
 * @param {number} options.learningRate
 * @param {string[]} options.roiKeys
 * @returns {Object}
 */
function getRemoteSeed(options) {
  const seed = {
    gradient: {},
    iterationCount: 0,
    learningRate: options.learningRate,
    mVals: {},
    objective: Infinity,
    previousBestFit: {
      gradient: {},
      mVals: {},
      objective: Infinity,
    },
    r2: 0,
  };

  options.roiKeys.forEach(key => {
    seed.gradient[key] = seed.previousBestFit.gradient[key] = 0;
    seed.mVals[key] = seed.previousBestFit.mVals[key] = Math.random();
  });

  return seed;
}

function markRemoteComplete(remoteResult) {
  return _.assign({}, remoteResult, { complete: true });
}

/**
 * Pick ordered values.
 *
 * @example
 * pickOrderedValues(
 *   ['wat', 'silly'],
 *   { silly: 100, thing: 200, wat: 300 }
 * );
 * // => [300, 100]
 *
 * @param {string[]} order Collection of properties to pick from `values`
 * @param {Object} values
 * @param {boolean} [strict=false] Throw an error if `values` is missing a
 * property specified in `order`
 * @returns {Array}
 */
function pickOrderedValues(order, values, strict) {
  if (!Array.isArray(order)) {
    throw new Error('Expected order to be an array');
  }
  if (!(values instanceof Object)) {
    throw new Error('Expected values to be an object');
  }

  if (strict) {
    const valuesKeys = Object.keys(values);

    order.forEach(item => {
      if (valuesKeys.indexOf(item) === -1) {
        throw new Error(`Values missing property ${item}`);
      }
    });
  }

  return order.reduce((accumulator, prop) => { // eslint-disable-line arrow-body-style
    return accumulator.concat(values[prop]);
  }, []);
}

/**
 * Get regions of interest from Freesurfer files.
 *
 * @example
 * getROIsFromFiles(
 *   [
 *     './path/to/parsed/freesurfer-1.txt',
 *     './path/to/parsed/freesurfer-2.txt',
 *     './path/to/parsed/freesurfer-3.txt',
 *   ],
 *   ['Left-Hippocampus', 'Right-Hippocampus'],
 *   (error, roiValues) => {
 *     // `error` will contain any file-reading or Freesurfer-parsing related
 *     // errors.
 *     if (error) {
 *       throw error;
 *     }
 *
 *     // `roiValues` will be a collection of Freesurfer values ordered by file.
 *     // This is an array of arrays, looking something like:
 *     // [
 *     //   [4400.1, 4211.5], (freesurfer-1.txt)
 *     //   [4369.2, 3971.1], (freesurfer-2.txt)
 *     //   [4510.7, 4366.0], (freesurfer-3.txt)
 *     // ]
 *     console.log(roiValues);
 *   }
 * );
 *
 * @todo Figure out how to cache files' FreeSurfer analysis
 *
 * @param {string[]} filenames Collection of full paths to Freesurfer files
 * @param {string[]} roiKeys Freesurfer regions of interest (predictors?)
 * @param {function} callback Node-style callback. Returns a collection of
 * region-of-interest values.
 */
function getROIsFromFiles(filenames, roiKeys, callback) {
  async.waterfall([
    // Read files' contents
    (cb1) => async.map(
      filenames,
      (filename, cb) => fs.readFile(filename, 'utf-8', cb),
      cb1
    ),

    // Convert blobs to usable strings
    (blobs, cb2) => async.map(blobs, blob => blob.toString(), cb2),

    // Find regions of interest (ROIs) with the Freesurfer parser
    (contents, cb3) => async.map(
      contents,
      (content, cb3a) => { // eslint-disable-line consistent-return
        const freesurfer = new Freesurfer({
          string: content,
        });

        try {
          freesurfer.validate();
        } catch (error) {
          return cb3a(error);
        }

        cb3a(null, pickOrderedValues(roiKeys, freesurfer));
      },
      cb3
    ),
    callback,
  ]);
}

module.exports = {
  /* eslint-disable object-shorthand */
  mean: mean,
  sum: sum,
  getObjectiveValues: getObjectiveValues,
  unzipRoiKeyPairs: unzipRoiKeyPairs,
  zipRoiKeyPairs: zipRoiKeyPairs,
  getGradientValues: getGradientValues,
  getMVals: getMVals,
  calculateAverage: calculateAverage,
  calculateSensitivity: calculateSensitivity,
  calculateLaplaceScale: calculateLaplaceScale,
  addNoise: addNoise,
  getRoiValues: getRoiValues,
  getRemoteSeed: getRemoteSeed,
  getROIsFromFiles: getROIsFromFiles,
  markRemoteComplete: markRemoteComplete,
  pickOrderedValues: pickOrderedValues,
  /* eslint-enable object-shorthand */
};
