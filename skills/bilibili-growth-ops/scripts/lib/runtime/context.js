'use strict';

const { getRuntimePaths } = require('./paths');
const { FactStore } = require('../store');

function createRuntimeContext(options = {}) {
  const paths = getRuntimePaths(options);
  const store = new FactStore(paths.dbPath);
  return {
    paths,
    store,
    close() {
      store.close();
    },
  };
}

module.exports = {
  createRuntimeContext,
};
