import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import chokidar from 'chokidar';
import * as xml2js from 'xml2js';
import * as commander from 'commander';
import chalk from 'chalk';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function main() {
    const program = commander.program
        .argument(
            '[string]',
            'Path to RimWorld\'s Steam Workshop directory',
            'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100'
        )
        .argument('[string]', 'Mods index file', path.resolve(__dirname, '../mods.json'))
        .action(async (steamWsDir, modsIndexFile) => {
            let mods = await fs.readFile(modsIndexFile);

            mods = new Set(Object.values(JSON.parse(mods)).flat());

            watchDir(steamWsDir, mods);
        });

    await program.parseAsync();
}

function watchDir(dir, mods) {
    const watcher = chokidar.watch(
        dir,
        { awaitWriteFinish: true, ignoreInitial: true, useFsEvents: true, depth: 2 }
    );

    watcher.on('ready', () => {
        console.log(`Watching for file changes in ${dir}`);
    });

    watcher.on('add', async (path) => {
        if (path.toLowerCase().endsWith('\\about\\about.xml')) {
            let { name } = await getModMetaData(path);

            name = name.trim();

            if (mods.has(name)) {
                console.log(`${chalk.green('[MATCH]')}: ${name}`);
            } else {
                console.log(`${chalk.red('[NO MATCH]')}: ${name}`);
            }
        }
    });
}

async function getModMetaData(path) {
    const file = await fs.readFile(path, { encoding: 'utf8' });
    const { ModMetaData: { name: [name] } } = await xml2js.parseStringPromise(file);

    return { name };
}

await main();