/**
 * Multishot.
 * @module
 */
'use strict';

const async = require('async');
const helpers = require('./helpers.js');
const isEqual = require('lodash/isEqual');
const pkg = require('../package.json');
const runners = require('./runners.js');

/** Algorithm-specific constants. */
const EPSILON = 1;
const INITIAL_LEARNING_RATE = 0.7;
const MAX_ITERATION_COUNT = 200;
const ROI_KEYS = ['Left-Hippocampus'];
const TOLERANCE = 1e-5;

module.exports = {
  label: pkg.description,
  local: {
    type: 'function',

    /**
     * Local computation function.
     *
     * @see `LocalPipelineRunner#run`
     *
     * @param {Object} params
     * @param {string[]} params.filenames
     * @param {string} params.previousData
     * @param {string} params.remoteResult
     * @param {string} params.result
     * @param {string} params.username
     * @param {function} callback Node-style callback
     */
    fn: (params, callback) => { // eslint-disable-line consistent-return
      // Don’t do anything if there isn’t a remote result
      if (!params.remoteResult) {
        return callback(null, null);
      }


      const aggregateMVals = params.remoteResult.mVals;
      const filenames = params.filenames;
      const previousData = params.previousData;
      const controls = [];
      const patients = [];

      /**
      * Don’t calculate a regression if the last aggregate mVals (stored on the
      * previous result) match this run's aggregate mVals.
      *
      * @todo  Ensure this check is necessary.
      */
      if (
        previousData &&
        isEqual(previousData.previousAggregateMVals, aggregateMVals)
      ) {
        return callback(null, null);
      }

      /**
       * @todo This filter’s a user’s files based on the presense of one of the
       * keywords “control” or “patient” in the file path. If one of these isn’t
       * found it throws an error.
       *
       * Figure out how to make this controlled by the user via COINSTAC’s UI.
       */
      for (var i = 0, il = filenames.length; i < il; i++) { // eslint-disable-line
        if (filenames[i].indexOf('controls')) {
          controls.controls.push(filenames[i]);
        } else if (filenames[i].indexOf('patients')) {
          patients.patients.push(filenames[i]);
        } else {
          return callback(new Error(
            `Expected file path “${filenames[i]}” to contain either “controls”
            or “patients”.`
          ));
        }
      }

      async.series(
        {
          controls: (cb1) => helpers.getROIsFromFiles(controls, ROI_KEYS, cb1),
          patients: (cb2) => helpers.getROIsFromFiles(patients, ROI_KEYS, cb2),
        },
        (error, results) => { // eslint-disable-line consistent-return
          if (error) {
            return callback(error);
          }

          callback(null, runners.computeRegression(
            results.controls, // xVals?
            results.patients, // yVals?
            aggregateMVals,
            ROI_KEYS
          ));
        }
      );
    },
  },
  name: pkg.name,
  remote: {
    type: 'function',

    /**
     * Remote computation function.
     *
     * @see `RemotePipelineRunner#_run`
     *
     * @param {Object} params
     * @param {(Object|undefined)} params.previousData
     * @param {Object} params.result ???
     * @param {Object[]} params.userResults
     * @param {function} callback
     */
    fn: (params, callback) => { // eslint-disable-line consistent-return
      const previousData = params.previousData;
      const userResults = params.userResults;

      // Seed remote result if there's no previous result
      if (!previousData) {
        return callback(null, helpers.getRemoteSeed({
          learningRate: INITIAL_LEARNING_RATE,
          roiKeys: ROI_KEYS,
        }));
      }

      if (
        // Wait for user results
        (!Array.isArray(userResults) || !userResults.length) ||

        // Wait for user results to sync to last aggregate's mVals
        !userResults
          .map(r => r.previousAggregateMVals)
          .every(userMVals => isEqual(userMVals, previousData.mVals))
      ) {
        return callback(null, null);
      }

      /**
       * Signal to the pipeline runner to mark as 'complete' if maximum
       * iteraction count is exceeded
       */
      if (previousData.iterationCount >= MAX_ITERATION_COUNT) {
        return callback(null, helpers.markRemoteComplete(previousData));
      }

      const newResult = runners.computeAverage(
        previousData,
        userResults,
        TOLERANCE,
        ROI_KEYS
      );

      /**
       * Signal to the pipeline runner to mark as 'complete' if
       * `computeAggregate` signals to stop:
       */
      if (newResult === runners.computeAverage.STOP) {
        return callback(null, helpers.markRemoteComplete(newResult));
      }

      callback(null, newResult);
    },
  },
  version: pkg.version,
};
