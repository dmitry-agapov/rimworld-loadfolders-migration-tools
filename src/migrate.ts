import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as commander from 'commander';
import * as utils from './utils.js';
import * as patchesDirVFS from './patches-dir-vfs.js';
import * as patcher from './patcher.js';

interface ProgramOptions {
    src: string;
    dest?: string;
    km?: string;
    skipDirs?: string[];
    skipPatching?: boolean;
}

commander.program
    .argument('<string>', 'Path to mod directory.')
    .option('--src <string>', 'Subpath to directory with patches.', 'Patches')
    .option('--dest <string>', 'Destination directory subpath.')
    .option('--km <string>', '"Known mods" file path.')
    .option('--skip-dirs <strings...>', 'Directory names to skip.')
    .option('--skip-patching', 'Skip patching.')
    .action(migrate)
    .parseAsync();

async function migrate(
    absModDirPath: string,
    {
        src: patchesDirSubpath,
        dest: destDirSubpath,
        km: absKnownModsFilePath,
        skipDirs = [],
        skipPatching = false,
    }: ProgramOptions,
) {
    absModDirPath = path.resolve(absModDirPath);
    const absPatchesDirPath = path.join(absModDirPath, patchesDirSubpath);
    if (destDirSubpath) destDirSubpath = path.normalize(destDirSubpath);
    const absDestDirPath = destDirSubpath ? path.join(absModDirPath, destDirSubpath) : undefined;
    if (absKnownModsFilePath) absKnownModsFilePath = path.resolve(absKnownModsFilePath);
    const knownMods: utils.KnownMods | undefined = absKnownModsFilePath
        ? JSON.parse(await fs.readFile(absKnownModsFilePath, 'utf-8'))
        : undefined;
    console.log('Loading files into memory...');
    const patchesDir = await patchesDirVFS.createVFS(absPatchesDirPath, skipDirs, knownMods);
    const unmigratableSubdirs: patchesDirVFS.VFSSubdir[] = [];
    const migratableSubdirs: patchesDirVFS.VFSSubdir[] = [];

    for (const vSubdir of patchesDir.subdirs) {
        if (vSubdir.errors && Object.keys(vSubdir.errors).length > 0) {
            unmigratableSubdirs.push(vSubdir);
        } else {
            migratableSubdirs.push(vSubdir);
        }
    }

    if (unmigratableSubdirs.length > 0) {
        const filePath = path.resolve('errors.json');

        await fs.writeFile(
            filePath,
            patchesDirVFS.printMigrationErrors(unmigratableSubdirs),
            'utf-8',
        );

        console.log(`Unable to migrate some directories. See ${filePath} for details.`);
    }

    if (knownMods && destDirSubpath) {
        console.log('Generating <loadFolders> records...');
        const records: string[] = [];
        const filePath = path.resolve('load-folders-records.xml');

        for (const vSubdir of migratableSubdirs) {
            const modNames = [...new Set(vSubdir.modSets.toArrayDeep().flat())];
            const packageIds = modNames.map((modName) => knownMods[modName]);
            const recordDirPath = `${destDirSubpath.replaceAll(path.sep, '/')}/${vSubdir.name}`;

            records.push(
                `<li IfModActive="${packageIds.join(', ')}">${utils.escapeXMLStr(recordDirPath)}</li>`,
            );
        }

        await fs.writeFile(filePath, records.join(os.EOL), 'utf-8');

        console.log(`load-folders-records.xml is created at ${filePath}`);
    } else {
        console.log(
            'No "known mods" file path or destination directory subpath were provided. Skipping <loadFolders> records generation.',
        );
    }

    if (absDestDirPath && !skipPatching) {
        console.log('Patching...');

        for (const vSubdir of migratableSubdirs) {
            for (const vFile of vSubdir.files) {
                patcher.patchDOC(vFile.dom.window.document);

                const patchedFileStr = utils.strToXMLFileStr(vFile.dom.serialize());
                const absFilePath = path.join(
                    absDestDirPath,
                    vSubdir.name,
                    'Patches',
                    vSubdir.name,
                    vFile.subpath,
                );

                await utils.writeFileRecursive(absFilePath, patchedFileStr, 'utf-8');
            }

            await fs.rm(vSubdir.absPath, { recursive: true });
        }
    } else {
        console.log(
            'No destination directory path was provided or --skip-patching is set to true. Skipping patching.',
        );
    }

    console.log('Done!');
}
