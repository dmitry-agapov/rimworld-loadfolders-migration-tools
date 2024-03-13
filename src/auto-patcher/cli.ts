import fs from 'node:fs/promises';
import path from 'node:path';
import jsdom from 'jsdom';
import * as commander from 'commander';
import { patchFile, patchXML } from './patcher.js';

const program = commander.program
    .argument('<string>', 'Path to mod folder')
    .option('-d', 'Dry run')
    .action(main);

async function main(modPath: string, { d }: { d: boolean }) {
    const dom = await jsdom.JSDOM.fromFile(path.join(modPath, 'LoadFolders.xml'), {
        contentType: 'text/xml',
    });
    const root = dom.window.document.firstElementChild;
    const entries = root?.querySelectorAll(':scope > v1\\.4 > li') || [];
    let skipped = 0;

    for (const entry of entries) {
        const ifModActiveAttrVal = entry.getAttribute('IfModActive');
        const dirSubPath = entry.textContent;

        if (
            !ifModActiveAttrVal ||
            ifModActiveAttrVal.includes(',') ||
            !dirSubPath ||
            !dirSubPath.startsWith('ModPatches')
        ) {
            console.log(`Skipping ${dirSubPath}`);
            skipped++;
            continue;
        }

        (await fs.readdir(path.join(modPath, dirSubPath), { recursive: true }))
            .filter((item) => item.toLowerCase().endsWith('.xml'))
            .forEach(async (fileSubPath) => {
                const filePath = path.join(modPath, dirSubPath, fileSubPath);

                if (d) {
                    const file = await fs.readFile(filePath, { encoding: 'utf-8' });

                    patchXML(file);
                } else {
                    patchFile(filePath);
                }
            });
    }

    console.log(`All: ${entries.length}`);
    console.log(`Skipped: ${skipped}`);
    console.log('Done!');
}

await program.parseAsync();
