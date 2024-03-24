import fs from 'node:fs';
import path from 'node:path';
import * as commander from 'commander';
import jsdom from 'jsdom';
import * as utils from './utils.js';
import * as types from './types.js';

commander.program
    .argument(
        '[string]',
        'Path to directory with mods.',
        'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100',
    )
    .argument('[string]', 'Output file path.', path.resolve('./known-mods.json'))
    .action((dirPath: string, outFilePath: string) => {
        dirPath = path.resolve(dirPath);
        outFilePath = path.resolve(outFilePath);
        const dirContent = fs.readdirSync(dirPath);
        const filesToScan = dirContent.map((item) => path.join(dirPath, item, 'about/about.xml'));
        const knownMods = new utils.KnownMods({
            Royalty: ['Ludeon.Rimworld.Royalty'],
            Ideology: ['Ludeon.Rimworld.Ideology'],
            Biotech: ['Ludeon.Rimworld.Biotech'],
        });

        for (const filePath of filesToScan) {
            const file = fs.readFileSync(filePath, 'utf-8');
            const { name, packageId } = extractModMetadata(file);

            if (name && packageId) knownMods.add(name, packageId);
        }

        const outFile = utils.fixEOL(JSON.stringify(knownMods));

        fs.writeFileSync(outFilePath, outFile, 'utf-8');
    })
    .parse();

function extractModMetadata(xmlStr: string): {
    name: types.ModName | undefined;
    packageId: types.ModPackageId | undefined;
} {
    const dom = new jsdom.JSDOM(xmlStr, { contentType: 'text/xml' });
    const root = dom.window.document.documentElement;
    const name = utils.getDirectChildByTagName(root, 'name')?.textContent?.trim();
    const packageId = utils.getDirectChildByTagName(root, 'packageId')?.textContent?.trim();

    return {
        name: name as types.BaseToOpaque<typeof name, types.ModName>,
        packageId: packageId as types.BaseToOpaque<typeof packageId, types.ModPackageId>,
    };
}
