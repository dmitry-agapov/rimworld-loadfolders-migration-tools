import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import * as xml2js from 'xml2js';
import * as commander from 'commander';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function main() {
    const program = commander.program
        .argument('<string>', 'Path to mod folder')
        .option(
            '-o [string]',
            'Output file path',
            path.resolve(__dirname, '../mods.json'),
        )
        .option('-s [string]', 'Directories to skip divided by ","')
        .action(async (path, { o, s }) => {
            const modsIndex = await scanMod(path, s.split(','));

            await writeModsIndex(modsIndex, o);
            console.log('Done!');
        });

    await program.parseAsync();
}

async function scanMod(dir, skipDirs) {
    dir = path.join(dir, 'Patches');

    const dirContent = (await fs.readdir(dir)).filter(
        (item) => !skipDirs.includes(item),
    );
    const result = {
        originalDirsOrder: dirContent,
        dirs: {},
    };

    console.log(`Scanning ${dirContent.length} directories`);

    for (const dirName of dirContent) {
        const modNames = await scanPatchSubdir(path.join(dir, dirName));

        result.dirs[dirName] = modNames;
    }

    return result;
}

async function scanPatchSubdir(dir) {
    const dirContent = await fs.readdir(dir, { recursive: true });
    const result = new Set();

    for (const fileOrDir of dirContent) {
        if (fileOrDir.toLowerCase().endsWith('.xml')) {
            const modNames = await scanPatchFile(path.join(dir, fileOrDir));

            modNames.forEach(result.add, result);
        }
    }

    return result;
}

async function scanPatchFile(path) {
    const file = await fs.readFile(path, { encoding: 'utf8' });
    const obj = await xml2js.parseStringPromise(file);
    const result = new Set();

    if (!Array.isArray(obj.Patch.Operation)) {
        return result;
    }

    for (const lvl1patchOp of obj.Patch.Operation) {
        if (lvl1patchOp['$'].Class === 'PatchOperationFindMod') {
            lvl1patchOp.mods[0].li.forEach((item) => result.add(item.trim()));
        } else if (lvl1patchOp['$'].Class === 'PatchOperationSequence') {
            for (const patchOp of lvl1patchOp.operations[0].li) {
                if (patchOp['$'].Class === 'PatchOperationFindMod') {
                    patchOp.mods[0].li.forEach((item) =>
                        result.add(item.trim()),
                    );
                }
            }
        }
    }

    return result;
}

async function writeModsIndex(content, outFile) {
    await fs.writeFile(
        outFile,
        JSON.stringify(
            content,
            (_, value) => (value instanceof Set ? [...value] : value),
            2,
        ),
    );

    console.log(`Mods index file is located at ${outFile}`);
}

await main();
