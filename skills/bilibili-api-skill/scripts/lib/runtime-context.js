'use strict';

let currentContext = null;

function setCommandContext(context) {
  currentContext = context;
}

function getCommandContext() {
  return currentContext;
}

module.exports = {
  setCommandContext,
  getCommandContext,
};
