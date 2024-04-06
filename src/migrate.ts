import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as commander from 'commander';
import * as utils from './utils.js';
import * as patcher from './patcher.js';
import jsdom from 'jsdom';
import * as types from './types.js';
import { ModSetCollection, ModSet } from './ModSetCollection.js';
import { MigrationIssues, DirIssues, DirIssueType } from './MigrationIssues.js';
import { KnownMods } from './KnownMods.js';
import * as defaultPaths from './defaultPaths.js';
import * as ProgressLogger from './ProgressLogger.js';

/*
	!IMPORTANT!
	We do not skip 'empty' files, because we want them to be copied during patching process.
*/

interface ProgramOptions {
    skipDirs: string[];
    skipPatching: boolean;
    overwriteFiles: boolean;
    keepOrigFiles: boolean;
}

commander.program
    .argument('<string>', 'Source directory path.')
    .argument('<string>', 'Destination directory path.')
    .argument('<string>', '<loadFolders> record path prefix.')
    .argument('[string]', '"Known mods" file path.', defaultPaths.knownModsFile)
    .option('--skip-dirs <strings...>', 'Directory names to skip.', [])
    .option('--skip-patching', 'Skip patching.', false)
    .option('--overwrite-files', 'Overwrite files.', false)
    .option('--keep-orig-files', 'Keep original files.', false)
    .action(migrate)
    .parseAsync();

async function migrate(
    srcDirPath: string,
    destDirPath: string,
    loadFoldersPathPrefix: string,
    knownModsFilePath: string,
    options: ProgramOptions,
) {
    srcDirPath = path.normalize(srcDirPath);
    destDirPath = path.normalize(destDirPath);
    if (destDirPath === srcDirPath) {
        console.log('Source and destination paths cannot be equal. Exiting.');

        return;
    }
    const knownMods = await KnownMods.fromFile(knownModsFilePath);
    let subDirNames = await utils.fs.getSubDirNames(srcDirPath);
    if (options.skipDirs.length > 0) {
        subDirNames = subDirNames.filter((dirName) => !options.skipDirs.includes(dirName));
    }
    const migrationIssues: MigrationIssues = {};
    const loadFoldersRecords: string[] = [];
    const logProgress = ProgressLogger.createProgressLogger('Migrating', subDirNames.length);

    for (const subDirName of subDirNames) {
        logProgress(subDirName);

        const subDirSrcPath = path.join(srcDirPath, subDirName);
        const dir = await loadDir(subDirSrcPath);
        const [loadFoldersRecord, issues] = tryCreateDirLoadFoldersRecord(
            dir,
            loadFoldersPathPrefix,
            knownMods,
        );

        if (loadFoldersRecord) {
            loadFoldersRecords.push(loadFoldersRecord);

            if (!options.skipPatching) {
                const subDirDestPath = path.join(destDirPath, dir.name, 'Patches', dir.name);

                await migrateDir(dir, subDirDestPath, options);
            }
        } else if (issues) {
            migrationIssues[subDirName] = issues;
        }
    }

    if (loadFoldersRecords.length > 0) {
        const filePath = defaultPaths.loadFoldersRecordsFile;

        await fs.writeFile(filePath, loadFoldersRecords.join(os.EOL));

        console.log(`<loadFolders> records file was created at ${filePath}`);
    }

    const migrationIssuesCount = Object.keys(migrationIssues).length;

    if (migrationIssuesCount > 0) {
        const filePath = defaultPaths.issuesFile;

        await utils.fs.writeJSON(filePath, migrationIssues);

        console.log(
            `${migrationIssuesCount} directories were not migrated. See ${filePath} for details.`,
        );
    }

    console.log('Done!');
}

interface Dir {
    name: string;
    path: string;
    files: File[];
    modSets: ModSetCollection;
}

async function loadDir(dirPath: string): Promise<Dir> {
    const fileSubPaths = await utils.fs.getXMLFileSubPaths(dirPath, true);
    const files: File[] = [];
    const modSets = new ModSetCollection();
    const name = path.basename(dirPath);

    for (const fileSubPath of fileSubPaths) {
        const file = await loadFile(dirPath, fileSubPath);

        modSets.mergeWith(file.modSets);

        files.push(file);
    }

    return {
        name,
        path: dirPath,
        files,
        modSets,
    };
}

interface File {
    readonly subPath: string;
    readonly dom: jsdom.JSDOM;
    readonly modSets: ModSetCollection;
}

async function loadFile(dirPath: string, subPath: string): Promise<File> {
    const filePath = path.join(dirPath, subPath);
    const file = await fs.readFile(filePath, 'utf-8');
    const dom = new jsdom.JSDOM(file, { contentType: 'text/xml' });
    const modSets = extractModSetsFromDoc(dom.window.document);

    return {
        subPath,
        dom,
        modSets,
    };
}

function extractModSetsFromDoc(doc: Document) {
    const result = new ModSetCollection();

    utils.dom.traverseElemTree(doc.documentElement, (elem) => {
        if (patcher.isUnpackablePatchOpFindMod(elem)) {
            result.add(extractModSetFromPOFM(elem));
        }
    });

    return result;
}

function extractModSetFromPOFM(elem: Element) {
    const result = new ModSet();
    const modsElem = utils.dom.getChildByTagName(elem, utils.patch.ElemTagName.mods);

    if (!modsElem) {
        return result;
    }

    const modEntries = utils.dom.getChildrenByTagName(modsElem, utils.patch.ElemTagName.li);

    for (const modEntry of modEntries) {
        if (modEntry.textContent) {
            const modName = modEntry.textContent.trim();

            result.add(modName as types.BaseToOpaque<typeof modName, types.ModName>);
        }
    }

    return result;
}

function tryCreateDirLoadFoldersRecord(
    dir: Dir,
    pathPrefix: string,
    knownMods: KnownMods,
): [lfRecord: string, issues: undefined] | [lfRecord: undefined, issues: DirIssues] {
    if (dir.modSets.size === 0) {
        return [undefined, { [DirIssueType.NO_PATCHES]: true }];
    }

    const issues: DirIssues = {};
    const packageIds = new Set<types.ModPackageId>();
    const unidentMods = new Set<types.ModName>();
    const modNames = dir.modSets.names;

    for (const modName of modNames) {
        const modPackageIds = knownMods.get(modName);

        if (!modPackageIds) {
            unidentMods.add(modName);
        } else {
            for (const packageId of modPackageIds) {
                packageIds.add(packageId);
            }
        }
    }

    if (unidentMods.size > 0) {
        issues[DirIssueType.UNIDENT_MODS_FOUND] = [...unidentMods];
    }

    if (dir.modSets.size > 1) {
        const details: DirIssues[DirIssueType.IS_COLLECTION] = [];

        for (const file of dir.files) {
            const detailsRecord = details.find((rec) => rec.modSets.isEqualTo(file.modSets));

            if (detailsRecord) {
                detailsRecord.files.push(file.subPath);
            } else {
                details.push({
                    modSets: file.modSets,
                    files: [file.subPath],
                });
            }
        }

        issues[DirIssueType.IS_COLLECTION] = details;
    }

    if (Object.keys(issues).length > 0) {
        return [undefined, issues];
    }

    const packageIdsStr = [...packageIds].join(', ');
    const dirSubPath = path.join(pathPrefix, dir.name).replaceAll(path.sep, '/');

    return [
        `<li IfModActive="${utils.dom.escapeStr(packageIdsStr)}">${
            utils.dom.escapeStr(dirSubPath) //
        }</li>`,
        undefined,
    ];
}

async function migrateDir(
    dir: Dir,
    destDirPath: string,
    options: Pick<ProgramOptions, 'overwriteFiles' | 'keepOrigFiles'>,
) {
    for (const file of dir.files) {
        await migrateFile(file, destDirPath, options);
    }

    if (!options.keepOrigFiles) {
        await fs.rm(dir.path, { recursive: true });
    }
}

async function migrateFile(
    file: File,
    destDirPath: string,
    options: Pick<ProgramOptions, 'overwriteFiles'>,
) {
    patcher.patchDOC(file.dom.window.document);

    const filePath = path.join(destDirPath, file.subPath);
    const patchedFile = utils.xml.toXMLFile(file.dom.serialize());

    await utils.fs.writeFileRecursive(filePath, patchedFile, {
        flag: options.overwriteFiles ? 'w' : 'wx',
    });
}
