import fs from 'node:fs/promises';
import path from 'node:path';
import * as xml2js from 'xml2js';
import * as commander from 'commander';
import { patchFile } from './patcher.js';

async function main() {
    const program = commander.program
        .argument('<string>', 'Path to mod folder')
        .action(async (modPath) => {
            const loadFolders = await xml2js.parseStringPromise(
                await fs.readFile(path.join(modPath, 'LoadFolders.xml'), { encoding: 'utf8' }),
                { explicitCharkey: true },
            );
            const entries = loadFolders.loadFolders['v1.4'][0].li;
            let skipped = 0;

            for (const entry of entries) {
                const skip =
                    entry.$?.IfModActive.includes(',') || !entry._.startsWith('ModPatches');

                if (skip) {
                    console.log(`Skipping ${entry._}`);
                    skipped++;
                    continue;
                }

                const files = (
                    await fs.readdir(path.join(modPath, entry._), { recursive: true })
                ).filter((item) => item.toLowerCase().endsWith('.xml'));

                for (const filePath of files) {
                    await patchFile(path.join(modPath, entry._, filePath));
                }
            }

            console.log(`All: ${entries.length}`);
            console.log(`Skipped: ${skipped}`);
            console.log('Done!');
        });

    await program.parseAsync();
}

await main();
