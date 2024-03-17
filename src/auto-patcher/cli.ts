import * as commander from 'commander';
import { patchDir } from './patcher.js';

commander.program
    .argument('<string>', 'Src dir')
    .argument('[string]', 'Destination dir')
    .action(patchDir)
    .parse();
