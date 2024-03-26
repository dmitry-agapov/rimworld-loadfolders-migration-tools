import fs from 'node:fs';
import path from 'node:path';
import * as commander from 'commander';
import * as utils from './utils.js';

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
            const { name, packageId } = utils.extractModMetadata(file);

            if (name && packageId) knownMods.add(name, packageId);
        }

        const outFile = utils.fixEOL(JSON.stringify(knownMods));

        fs.writeFileSync(outFilePath, outFile, 'utf-8');
    })
    .parse();
