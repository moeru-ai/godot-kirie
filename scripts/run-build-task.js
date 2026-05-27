#!/usr/bin/env node
import * as tasks from "./build.ts"; await tasks[process.argv[2]](...process.argv.slice(3));
