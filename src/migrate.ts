import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as commander from 'commander';
import * as utils from './utils.js';
import * as patcher from './patcher.js';
import jsdom from 'jsdom';
import commonPathPrefix from 'common-path-prefix';
import * as types from './types.js';

/*
	!IMPORTANT!
	We do not skip 'empty' files, because we want them to be copied during patching process.
*/

interface ProgramOptions {
    skipDirs: string[];
    skipPatching: boolean;
}

commander.program
    .argument('<string>', 'Source directory path.')
    .argument(
        '<string>',
        'Destination directory path. Must share common path with source directory.',
    )
    .argument('<string>', '"Known mods" file path.')
    .option('--skip-dirs <strings...>', 'Directory names to skip.', [])
    .option('--skip-patching', 'Skip patching.', false)
    .action(migrate)
    .parseAsync();

async function migrate(
    srcDirPath: string,
    destDirPath: string,
    knownModsFilePath: string,
    { skipDirs, skipPatching }: ProgramOptions,
) {
    const absSrcDirPath = path.resolve(srcDirPath);
    const absDestDirPath = path.resolve(destDirPath);
    const commonPath = commonPathPrefix([absSrcDirPath, absDestDirPath]);
    if (
        absDestDirPath === absSrcDirPath ||
        absDestDirPath.startsWith(absSrcDirPath) ||
        !commonPath
    ) {
        throw new Error('Invalid destination directory path.');
    }
    const destDirSubpath = absDestDirPath.replace(commonPath, '');
    const absKnownModsFilePath = path.resolve(knownModsFilePath);
    const knownMods: types.KnownMods = JSON.parse(await fs.readFile(absKnownModsFilePath, 'utf-8'));
    const dirNames = await fs.readdir(absSrcDirPath, 'utf-8');
    const migrationIssues: MigrationIssues = {};
    const loadFoldersRecords: string[] = [];
    const logProgress = utils.createProgressLogger('Migrating', dirNames.length - skipDirs.length);

    for (const dirName of dirNames) {
        if (skipDirs.includes(dirName)) continue;

        const absDirPath = path.join(absSrcDirPath, dirName);
        const [dirFiles, dirModsets] = await loadDirFiles(absDirPath);
        const dirIssues = scanDirForIssues(dirFiles, dirModsets, knownMods);

        if (!utils.isEmptyObj(dirIssues)) {
            migrationIssues[dirName] = dirIssues;
        } else {
            const loadFoldersRecord = createDirLoadFoldersRecord(
                destDirSubpath,
                dirName,
                dirModsets,
                knownMods,
            );
            loadFoldersRecords.push(loadFoldersRecord);

            if (!skipPatching) await migrateDir(absDirPath, dirFiles, absDestDirPath);
        }

        logProgress(dirName);
    }

    if (loadFoldersRecords.length > 0) {
        const absFilePath = await writeLoadFoldersRecordsFile(loadFoldersRecords);

        console.log(`<loadFolders> records file is created at ${absFilePath}`);
    }

    if (!utils.isEmptyObj(migrationIssues)) {
        const absFilePath = await writeMigrationIssuesFile(migrationIssues);
        const migrationIssuesCount = utils.objSize(migrationIssues);

        console.log(
            `${migrationIssuesCount} directories were not migrated. See ${absFilePath} for details.`,
        );
    }

    console.log('Done!');
}

async function loadDirFiles(absDirPath: string) {
    const dirContent = await fs.readdir(absDirPath, { recursive: true, encoding: 'utf-8' });
    const dirFileSubpaths = dirContent.filter((subpath) => subpath.toLowerCase().endsWith('.xml'));
    const dirFiles: LoadedFile[] = [];
    const dirModsets = new ModsetCollection();

    for (const dirFileSubpath of dirFileSubpaths) {
        const file = await loadFile(absDirPath, dirFileSubpath);

        dirModsets.mergeWith(file.modsets);

        dirFiles.push(file);
    }

    return [dirFiles, dirModsets] as const;
}

interface LoadedFile {
    readonly subpath: string;
    readonly dom: jsdom.JSDOM;
    readonly modsets: ModsetCollection;
}

async function loadFile(absParentDirPath: string, subpath: string): Promise<LoadedFile> {
    const absFilePath = path.join(absParentDirPath, subpath);
    const file = await fs.readFile(absFilePath);
    const dom = new jsdom.JSDOM(file, { contentType: 'text/xml' });
    const modsets = extractModsetsFromDoc(dom.window.document);

    return {
        subpath,
        dom,
        modsets,
    };
}

function extractModsetsFromDoc(doc: Document) {
    const result = new ModsetCollection();

    utils.traverseElemTree(doc.documentElement, (elem) => {
        if (patcher.isUnpackablePOFM(elem)) result.add(extractModsetFromPOFM(elem));
    });

    return result;
}

function extractModsetFromPOFM(elem: Element) {
    const result = new Modset();
    const modsElem = utils.getDirectChildByTagName(elem, 'mods');

    if (!modsElem) return result;

    const modEntries = utils.getAllDirectChildrenByTagName(modsElem, 'li');

    for (const modEntry of modEntries) {
        if (!modEntry.textContent) continue;

        result.add(modEntry.textContent.trim());
    }

    return result;
}

type MigrationIssues = Record<string, DirIssues>;

interface DirIssues {
    [DirIssueType.NO_PATCHES]?: true;
    [DirIssueType.UNIDENT_MODS_FOUND]?: string[];
    [DirIssueType.IS_COLLECTION]?: {
        modsets: ModsetCollection;
        files: string[];
    }[];
}

const enum DirIssueType {
    /**
     * Directory doesn't contain patches.
     *
     * This is mainly used to automatically skip directories that do not contain patches.
     */
    NO_PATCHES = 'NO_PATCHES',
    /**
     * Unidentified mods found.
     */
    UNIDENT_MODS_FOUND = 'UNIDENT_MODS_FOUND',
    /**
     * Directory contains files that apply patches to different sets of mods.
     */
    IS_COLLECTION = 'IS_COLLECTION',
}

function scanDirForIssues(
    files: LoadedFile[],
    modsets: ModsetCollection,
    knownMods: types.KnownMods,
): DirIssues {
    if (modsets.size === 0) return { [DirIssueType.NO_PATCHES]: true };

    const result: DirIssues = {};
    const unidentMods = scanModsetsForUnidentMods(modsets, knownMods);

    if (unidentMods.length > 0) result[DirIssueType.UNIDENT_MODS_FOUND] = unidentMods;

    if (modsets.size > 1) {
        const details: DirIssues[DirIssueType.IS_COLLECTION] = [];

        for (const file of files) {
            const detailsRecord = details.find((rec) => rec.modsets.isEqualTo(file.modsets));

            if (detailsRecord) {
                detailsRecord.files.push(file.subpath);
            } else {
                details.push({
                    modsets: file.modsets,
                    files: [file.subpath],
                });
            }
        }

        result[DirIssueType.IS_COLLECTION] = details;
    }

    return result;
}

function scanModsetsForUnidentMods(modsets: ModsetCollection, knownMods: types.KnownMods) {
    const result: string[] = [];

    for (const modName of new Set(modsets.toArrayDeep().flat())) {
        if (!knownMods[modName]) result.push(modName);
    }

    return result;
}

function createDirLoadFoldersRecord(
    destDirSubpath: string,
    dirName: string,
    modsets: ModsetCollection,
    knownMods: types.KnownMods,
) {
    const modNames = utils.dedupeArray(modsets.toArrayDeep().flat());
    const packageIds = utils.dedupeArray(modNames.flatMap((modName) => knownMods[modName]));
    const recordDirPath = `${destDirSubpath.replaceAll(path.sep, '/')}/${dirName}`;

    return `<li IfModActive="${packageIds.join(', ')}">${utils.escapeXMLStr(recordDirPath)}</li>`;
}

async function migrateDir(absSrcDirPath: string, files: LoadedFile[], absDestDirPath: string) {
    for (const file of files) {
        patcher.patchDOC(file.dom.window.document);

        const srcDirName = path.basename(absSrcDirPath);
        const patchedFileStr = utils.strToXMLFileStr(file.dom.serialize());
        const absFilePath = path.join(
            absDestDirPath,
            srcDirName,
            'Patches',
            srcDirName,
            file.subpath,
        );

        await utils.writeFileRecursive(absFilePath, patchedFileStr, 'utf-8');
    }

    await fs.rm(absSrcDirPath, { recursive: true });
}

async function writeLoadFoldersRecordsFile(data: string[]) {
    const absFilePath = path.resolve('load-folders-records.xml');

    await fs.writeFile(absFilePath, data.join(os.EOL), 'utf-8');

    return absFilePath;
}

async function writeMigrationIssuesFile(data: MigrationIssues) {
    const absFilePath = path.resolve('issues.json');

    await fs.writeFile(absFilePath, printMigrationIssues(data), 'utf-8');

    return absFilePath;
}

function printMigrationIssues(data: MigrationIssues) {
    const json = JSON.stringify(
        data,
        (_, value) => {
            if (value instanceof ModsetCollection) return value.toArrayDeep();

            return value;
        },
        '\t',
    );

    return utils.fixEOL(json);
}

const Modset = Set<string>;
type Modset = Set<string>;

class ModsetCollection {
    #sets: Modset[] = [];
    add(value: Modset) {
        if (!this.#sets.find((item) => utils.isEqSets(item, value))) this.#sets.push(value);
    }
    forEach(cb: (v: Modset) => void) {
        this.#sets.forEach(cb);
    }
    mergeWith(set: ModsetCollection) {
        set.forEach((item) => this.add(item));
    }
    toArrayDeep() {
        return this.#sets.map((item) => [...item]);
    }
    isEqualTo(set: ModsetCollection) {
        return this.size === set.size && this.#sets.every((item) => set.has(item));
    }
    has(value: Modset) {
        return !!this.#sets.find((item) => utils.isEqSets(item, value));
    }
    get size() {
        return this.#sets.length;
    }
}
