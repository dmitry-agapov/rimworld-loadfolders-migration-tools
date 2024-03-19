import fs from 'node:fs';
import path from 'node:path';
import * as commander from 'commander';
import jsdom from 'jsdom';
import * as utils from './utils.js';

commander.program
    .argument('<string>', 'Path to directory with mods.')
    .argument('[string]', 'Output file path.', path.resolve('./known-mods.json'))
    .action((dirPath: string, outFilePath: string) => {
        dirPath = path.resolve(dirPath);
        outFilePath = path.resolve(outFilePath);
        const dirContent = fs.readdirSync(dirPath);
        const filesToScan = dirContent.map((item) => path.join(dirPath, item, 'about/about.xml'));
        const knownMods: { [key: string]: string | string[] } = {
            Royalty: 'Ludeon.Rimworld.Royalty',
            Ideology: 'Ludeon.Rimworld.Ideology',
            Biotech: 'Ludeon.Rimworld.Biotech',
        };

        for (const filePath of filesToScan) {
            const [modName, packageId] = extractMetadata(filePath);

            if (!modName || !packageId) continue;

            const kmEntry = knownMods[modName];

            if (!kmEntry) {
                knownMods[modName] = packageId;
            } else if (typeof kmEntry === 'string') {
                knownMods[modName] = [kmEntry, packageId];
            } else if (Array.isArray(kmEntry)) {
                kmEntry.push(packageId);
            }
        }

        const outFile = utils.fixEOL(JSON.stringify(knownMods, undefined, 4));

        fs.writeFileSync(outFilePath, outFile, 'utf-8');
    })
    .parse();

function extractMetadata(filePath: string) {
    const file = fs.readFileSync(filePath);
    const dom = new jsdom.JSDOM(file, { contentType: 'text/xml' });
    const root = dom.window.document.documentElement;
    const modName = utils.getDirectChildByTagName(root, 'name')?.textContent?.trim();
    const packageId = utils.getDirectChildByTagName(root, 'packageId')?.textContent?.trim();

    return [modName, packageId] as const;
}
