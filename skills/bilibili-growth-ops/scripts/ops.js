#!/usr/bin/env node
'use strict';

const { parseArgs } = require('./lib/args');
const { CliError } = require('./lib/errors');
const { printResult, printError } = require('./lib/output');
const { runCommand } = require('./lib/commands');

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [group, command] = positionals;
  if (!group || !command) {
    throw new CliError('Usage: node scripts/ops.js <group> <command> [...options]');
  }

  const result = await runCommand(group, command, {
    ...options,
    runtimeRoot: options.runtimeRoot,
  });
  printResult(result);
}

main().catch((error) => {
  printError(error);
  process.exit(error.exitCode || 1);
});
