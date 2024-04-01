import fs from 'node:fs/promises';
import path from 'node:path';
import * as commander from 'commander';
import * as utils from './utils.js';
import { KnownMods } from './KnownMods.js';
import * as defaultPaths from './defaultPaths.js';
import os from 'node:os';
import * as ProgressLogger from './ProgressLogger.js';
import { extractModMetadata } from './extractModMetadata.js';

commander.program
    .argument(
        os.type() === 'Windows_NT' ? '[string]' : '<string>',
        'Path to directory with mods.',
        os.type() === 'Windows_NT' ? defaultPaths.steamWsDirWin : undefined,
    )
    .argument('[string]', 'Output file path.', defaultPaths.knownModsFile)
    .action(scanDir)
    .parseAsync();

async function scanDir(srcDirPath: string, outFilePath: string) {
    const subDirNames = await utils.fs.getSubDirNames(srcDirPath);
    const knownMods = new KnownMods();
    const logProgress = ProgressLogger.createProgressLogger('Scanning', subDirNames.length);

    for (const subDirName of subDirNames) {
        logProgress(subDirName);

        const filePath = path.join(srcDirPath, subDirName, 'about/about.xml');

        try {
            const file = await fs.readFile(filePath, 'utf-8');
            const { name, packageId } = extractModMetadata(file);

            if (name && packageId) {
                knownMods.add(name, packageId);
            }
        } catch {
            // We really don't care
        }
    }

    await utils.fs.writeJSON(outFilePath, knownMods);

    console.log(`"Known mods" file was created at ${outFilePath}`);

    console.log('Done!');
}
