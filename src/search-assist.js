import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import chokidar from 'chokidar';
import * as xml2js from 'xml2js';
import * as commander from 'commander';
import chalk from 'chalk';
import express from 'express';
import EventEmitter from 'node:events';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const events = new EventEmitter();

async function main() {
    const program = commander.program
        .argument(
            '[string]',
            "Path to RimWorld's Steam Workshop directory",
            'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100',
        )
        .argument(
            '[string]',
            'Mods index file',
            path.resolve(__dirname, '../mods.json'),
        )
        .option('-p [number]', 'Port', 8080)
        .action(async (steamWsDir, modsIndexFile, { p: port }) => {
            const modsIndex = JSON.parse(await fs.readFile(modsIndexFile));
            const mods = new Set(Object.values(modsIndex.dirs).flat());
            const htmlTemplate = await fs.readFile(
                path.join(__dirname, 'template.html'),
                { encoding: 'utf8' },
            );
            const installedMods = await scanInstalledMods(steamWsDir);
            const app = express();

            app.get('/', (req, res) => {
                res.send(
                    createHMTL(htmlTemplate, modsIndex.dirs, installedMods),
                );
            });

            app.get('/stream', (req, res) => {
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Connection', 'keep-alive');
                res.flushHeaders();

                function matchEventHandler(modName) {
                    res.write(`data: ${modName}\n\n`);
                }

                events.on('match', matchEventHandler);

                res.on('close', () => {
                    console.log('Client dropped connection');
                    events.off('match', matchEventHandler);
                    res.end();
                });
            });

            app.listen(port, () => {
                console.log(`Web GUI is available at http://localhost:${port}`);
            });

            watchDir(steamWsDir, mods, installedMods);
        });

    await program.parseAsync();
}

async function scanInstalledMods(dir) {
    const dirContent = await fs.readdir(dir);
    const result = new Set();

    console.log(`Scanning ${dirContent.length} directories`);

    for (const dirName of dirContent) {
        const { name } = await getModMetaData(
            path.join(dir, dirName, 'About/About.xml'),
        );

        result.add(name.trim());
    }

    return result;
}

function createHMTL(template, modsIndex, installedMods) {
    const content = Object.entries(modsIndex)
        .map(([dir, patchedMods]) =>
            `
        <p>${dir}</p>
        <ul>
            ${patchedMods
                .map(
                    (item) => `
            <li>
                <a data-mod-name="${item}" href="steam://openurl/https://steamcommunity.com/workshop/browse/?appid=294100&searchtext=${encodeURIComponent(item)}&browsesort=textsearch&section=readytouseitems"${installedMods.has(item) ? ' class="match"' : ''}
                >${item}</a>
            </li>`,
                )
                .join('')}
        </ul>
    `
                .split('\n')
                .map((item) => item.trim())
                .join(''),
        )
        .join('');

    return template.replace('CONTENT_ANCHOR', content);
}

function watchDir(dir, mods, installedMods) {
    const watcher = chokidar.watch(dir, {
        awaitWriteFinish: true,
        ignoreInitial: true,
        useFsEvents: true,
        depth: 2,
    });

    watcher.on('ready', () => {
        console.log(`Watching for file changes in ${dir}`);
    });

    watcher.on('add', async (path) => {
        if (path.toLowerCase().endsWith('\\about\\about.xml')) {
            let { name } = await getModMetaData(path);

            name = name.trim();

            if (mods.has(name)) {
                installedMods.add(name);

                events.emit('match', name);

                console.log(`${chalk.green('[MATCH]')}: ${name}`);
            } else {
                console.log(`${chalk.red('[NO MATCH]')}: ${name}`);
            }
        }
    });
}

async function getModMetaData(path) {
    const file = await fs.readFile(path, { encoding: 'utf8' });
    const {
        ModMetaData: {
            name: [name],
        },
    } = await xml2js.parseStringPromise(file);

    return { name };
}

await main();
