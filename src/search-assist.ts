import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import chokidar from 'chokidar';
import * as commander from 'commander';
import chalk from 'chalk';
import express from 'express';
import EventEmitter from 'node:events';
import * as types from './types.js';
import * as utils from './utils.js';
import { MigrationIssuesRaw, DirIssueType } from './MigrationIssues.js';
import { KnownMods } from './KnownMods.js';
import * as defaultPaths from './defaultPaths.js';
import os from 'node:os';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const events = new EventEmitter<{
    'mod-added': [ModAddedEvent];
}>();

interface ModAddedEvent {
    name: types.ModName;
    packageId: types.ModPackageId;
}

type ModMeta = ReturnType<typeof utils.extractModMetadata>;

interface ProgramOptions {
    p: string;
}

commander.program
    .argument(
        os.type() === 'Windows_NT' ? '[string]' : '<string>',
        "RimWorld's Steam Workshop directory path.",
        os.type() === 'Windows_NT' ? defaultPaths.steamWsDirWin : undefined,
    )
    .argument('[string]', '"Issues" file path.', defaultPaths.issuesFile)
    .argument('[string]', '"Known mods" file path.', defaultPaths.knownModsFile)
    .option('-p <number>', 'Port', '8080')
    .action(
        async (
            steamWsDirPath: string,
            issuesFilePath: string,
            knownModsFilePath: string,
            { p }: ProgramOptions,
        ) => {
            const absSteamWsDirPath = path.resolve(steamWsDirPath);
            const absIssuesFilePath = path.resolve(issuesFilePath);
            const absKnownModsFilePath = path.resolve(knownModsFilePath);
            const port = Number(p);
            const issuesFile = await fs.readFile(absIssuesFilePath, 'utf-8');
            const issues: MigrationIssuesRaw = JSON.parse(issuesFile);
            let knownMods: KnownMods;
            try {
                knownMods = await KnownMods.fromFile(absKnownModsFilePath);
                console.log(`Using "known mods" collection from ${absKnownModsFilePath}`);
            } catch {
                knownMods = new KnownMods();
                console.log('Using empty "known mods" collection.');
            }
            const unidentMods = extractAllUnidentModsFromMigrationIssues(issues, knownMods);
            if (unidentMods.size === 0) {
                console.log('No unidentified mods found. Exiting.');

                return;
            }
            const absPageTemplateFilePath = path.join(
                __dirname,
                '../src/search-assist/template.html',
            );
            const pageTemplate = await fs.readFile(absPageTemplateFilePath, 'utf-8');
            const app = express();

            app.get('/', (_, res) => res.send(genPage(pageTemplate, unidentMods)));

            app.get('/stream', (_, res) => {
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Connection', 'keep-alive');
                res.flushHeaders();

                function handleModAddedEvent(modMeta: ModAddedEvent) {
                    const { name, packageId } = modMeta;

                    if (!unidentMods.has(name)) {
                        logModMetaScanResult(MsgType.NO_MATCH, modMeta);
                    } else {
                        logModMetaScanResult(MsgType.MATCH, modMeta);
                        knownMods.add(name, packageId);
                        unidentMods.delete(name);
                        res.write(`data: ${name}\n\n`);
                    }
                }

                events.on('mod-added', handleModAddedEvent);

                res.on('close', () => {
                    console.log('Client dropped connection.');
                    events.off('mod-added', handleModAddedEvent);
                    res.end();
                });
            });

            app.get('/download', (_, res) => {
                res.setHeader('Content-Disposition', 'attachment; filename="known-mods.json"');
                res.json(knownMods);
            });

            await watchDir(absSteamWsDirPath);

            app.listen(port, () => {
                console.log(`Web GUI is available at http://localhost:${port}`);
            });
        },
    )
    .parseAsync();

function genPage(template: string, unidentMods: Set<string>) {
    let rows = '';

    for (const modName of unidentMods) {
        rows += `<li data-mod-name="${utils.escapeXMLStr(modName)}"><a href="steam://openurl/https://steamcommunity.com/workshop/browse/?appid=294100&searchtext=${encodeURIComponent(modName)}&browsesort=textsearch&section=readytouseitems">${utils.escapeXMLStr(modName)}</a></li>`;
    }

    return template.replace('CONTENT_ANCHOR', rows);
}

async function watchDir(absDirPath: string) {
    return new Promise<void>((resolve) => {
        const watcher = chokidar.watch(absDirPath, {
            awaitWriteFinish: true,
            ignoreInitial: true,
            useFsEvents: true,
            depth: 2,
        });

        watcher.on('ready', () => {
            console.log(`Watching for file changes in ${absDirPath}`);
            resolve();
        });

        watcher.on('add', handleFileCreatedEvent);
    });
}

async function handleFileCreatedEvent(filePath: string) {
    if (filePath.toLowerCase().endsWith(path.join('about', 'about.xml'))) {
        const file = await fs.readFile(filePath, 'utf-8');
        const { name, packageId } = utils.extractModMetadata(file);

        if (!name || !packageId) {
            logModMetaScanResult(MsgType.ERROR, { name, packageId });
        } else {
            events.emit('mod-added', { name, packageId });
        }
    }
}

function extractAllUnidentModsFromMigrationIssues(
    issues: MigrationIssuesRaw,
    knownMods: KnownMods,
) {
    const result = new Set<string>();

    for (const dirIssue of Object.values(issues)) {
        const dirUnidentMods = dirIssue[DirIssueType.UNIDENT_MODS_FOUND] || [];

        for (const modName of dirUnidentMods) {
            if (!knownMods.get(modName as types.BaseToOpaque<typeof modName, types.ModName>)) {
                result.add(modName);
            }
        }
    }

    return result;
}

const enum MsgType {
    ERROR = 'ERROR',
    MATCH = 'MATCH',
    NO_MATCH = 'NO MATCH',
}

function logModMetaScanResult(msgType: MsgType, { name, packageId }: ModMeta) {
    let prefix = `[${msgType}]`;
    const msg = `${name} | ${packageId}`;

    if (msgType === MsgType.ERROR || msgType === MsgType.NO_MATCH) {
        prefix = chalk.red(prefix);
    } else if (msgType === MsgType.MATCH) {
        prefix = chalk.green(prefix);
    }

    console.log(`${prefix}: ${msg}`);
}
