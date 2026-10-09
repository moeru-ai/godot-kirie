#!/usr/bin/env node
import { runMain } from "citty";

import { mainCommand } from "./commands/index.ts";

await runMain(mainCommand);
