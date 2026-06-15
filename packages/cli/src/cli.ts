#!/usr/bin/env node
import { runMain } from "citty";

import { mainCommand } from "./commands.ts";

await runMain(mainCommand);
