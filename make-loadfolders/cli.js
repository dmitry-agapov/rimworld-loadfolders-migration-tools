import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import * as xml2js from 'xml2js';
import * as commander from 'commander';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function main() {
    const program = commander.program
        .argument(
            '[string]',
            'Path to RimWorld\'s Steam Workshop directory',
            'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100'
        )
        .argument('[string]', 'Mods index file', path.resolve(__dirname, '../mods.json'))
        .option('-o [string]', 'Output file path', path.resolve(__dirname, '../LoadFoldres.xml'))
        .action(async (steamWsDir, modsIndexFile, { o }) => {
            const modsIndex = JSON.parse(await fs.readFile(modsIndexFile));
            const installedMods = {
                ...(await scanInstalledMods(steamWsDir)),
                Royalty: 'Ludeon.Rimworld.Royalty',
                Ideology: 'Ludeon.Rimworld.Ideology',
                Biotech: 'Ludeon.Rimworld.Biotech',
            };
            const result = [];

            for (const dirName of modsIndex.originalDirsOrder) {
                const patchedModsNames = modsIndex.dirs[dirName];
                const packageIds = [];

                patchedModsNames.forEach(item => {
                    if (installedMods[item] !== undefined) {
                        packageIds.push(installedMods[item]);
                    }
                });

                if (
                    patchedModsNames.length === packageIds.length &&
                    patchedModsNames.length !== 0
                ) {
                    result.push(`<li IfModActive="${packageIds.join(', ')}">ModPatches/${dirName}</li>`);
                } else {
                    let commentLines = patchedModsNames.map(item => `${item} - ${installedMods[item] || '[packageId is missing]'}`);

                    if (commentLines.length > 1) {
                        commentLines = commentLines.map(item => '	' + item);
                    }

                    const commentContent = commentLines.join('\n');
                    const comment = commentLines.length > 1 ? `<!--\n${commentContent}\n-->` : `<!-- ${commentContent} -->`;

                    result.push(
                        comment,
                        `<li>ModPatches/${dirName}</li>`
                    );
                }
            }

            await writeResult(result.join('\n'), o);
        });

    await program.parseAsync();
}

async function scanInstalledMods(dir) {
    const dirContent = await fs.readdir(dir);
    const result = {};

    console.log(`Scanning ${dirContent.length} directories`);

    for (const dirName of dirContent) {
        const { name, packageId } = await getModMetaData(path.join(dir, dirName, 'About/About.xml'));

        if (name !== undefined && packageId !== undefined) {
            result[name.trim()] = packageId;
        }
    }

    return result;
}

async function getModMetaData(path) {
    const file = await fs.readFile(path, { encoding: 'utf8' });
    const { ModMetaData } = await xml2js.parseStringPromise(file);
    const name = ModMetaData.name?.[0];
    const packageId = ModMetaData.packageId?.[0];

    return { name, packageId };
}

async function writeResult(content, outFile) {
    await fs.writeFile(outFile, content);

    console.log(`Out file is located at ${outFile}`);
}

await main();