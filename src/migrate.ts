import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as commander from 'commander';
import * as utils from './utils.js';
import * as patcher from './patcher.js';
import jsdom from 'jsdom';
import commonPathPrefix from 'common-path-prefix';
import * as types from './types.js';
import { ModsetCollection, Modset } from './ModsetCollection.js';
import { MigrationIssues, DirIssues, DirIssueType } from './MigrationIssues.js';

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
    const knownMods = await utils.KnownMods.fromFile(absKnownModsFilePath);
    const dirNames = await fs.readdir(absSrcDirPath, 'utf-8');
    const migrationIssues: MigrationIssues = {};
    const loadFoldersRecords: string[] = [];
    const logProgress = utils.createProgressLogger('Migrating', dirNames.length - skipDirs.length);

    for (const dirName of dirNames) {
        if (skipDirs.includes(dirName)) continue;

        logProgress(dirName);

        const absDirPath = path.join(absSrcDirPath, dirName);
        const [dirFiles, dirModsets] = await loadDirFiles(absDirPath);
        const [loadFoldersRecord, dirIssues] = tryCreateDirLoadFoldersRecord(
            destDirSubpath,
            dirName,
            dirModsets,
            dirFiles,
            knownMods,
        );

        if (loadFoldersRecord) {
            loadFoldersRecords.push(loadFoldersRecord);

            if (!skipPatching) await migrateDir(absDirPath, dirFiles, absDestDirPath);
        } else if (dirIssues) {
            migrationIssues[dirName] = dirIssues;
        }
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
    const dirFileSubpaths = dirContent.filter(utils.hasXMLExt);
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
        if (patcher.isUnpackablePatchOpFindMod(elem)) result.add(extractModsetFromPOFM(elem));
    });

    return result;
}

function extractModsetFromPOFM(elem: Element) {
    const result = new Modset();
    const modsElem = utils.getDirectChildByTagName(elem, types.ElemTagName.mods);

    if (!modsElem) return result;

    const modEntries = utils.getAllDirectChildrenByTagName(modsElem, types.ElemTagName.li);

    for (const modEntry of modEntries) {
        if (modEntry.textContent) {
            const modName = modEntry.textContent.trim();

            result.add(modName as types.BaseToOpaque<typeof modName, types.ModName>);
        }
    }

    return result;
}

function tryCreateDirLoadFoldersRecord(
    destDirSubpath: string,
    dirName: string,
    modsets: ModsetCollection,
    dirFiles: LoadedFile[],
    knownMods: utils.KnownMods,
): [string, undefined] | [undefined, DirIssues] {
    if (modsets.size === 0) return [undefined, { [DirIssueType.NO_PATCHES]: true }];

    const issues: DirIssues = {};
    const packageIds = new Set<types.ModPackageId>();
    const unidentMods = new Set<types.ModName>();
    const modNames = modsets.names;

    for (const modName of modNames) {
        const modPackageIds = knownMods.get(modName);

        if (!modPackageIds) {
            unidentMods.add(modName);
        } else {
            for (const packageId of modPackageIds) packageIds.add(packageId);
        }
    }

    if (unidentMods.size > 0) issues[DirIssueType.UNIDENT_MODS_FOUND] = [...unidentMods];

    if (modsets.size > 1) {
        const details: DirIssues[DirIssueType.IS_COLLECTION] = [];

        for (const file of dirFiles) {
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

        issues[DirIssueType.IS_COLLECTION] = details;
    }

    if (!utils.isEmptyObj(issues)) return [undefined, issues];

    const packageIdsStr = utils.escapeXMLStr([...packageIds].join(', '));
    const recordDirPath = `${destDirSubpath.replaceAll(path.sep, '/')}/${dirName}`;
    const recordDirPathStr = utils.escapeXMLStr(recordDirPath);

    return [`<li IfModActive="${packageIdsStr}">${recordDirPathStr}</li>`, undefined];
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
    const json = JSON.stringify(data);
    const file = utils.fixEOL(json);

    await fs.writeFile(absFilePath, file, 'utf-8');

    return absFilePath;
}
