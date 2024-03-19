import fs from 'node:fs/promises';
import path from 'node:path';
import * as commander from 'commander';
import * as utils from './utils.js';
import * as patchesDirVFS from './patches-dir-vfs.js';
import * as patcher from './patcher.js';

interface ProgramOptions {
    dest?: string;
    km?: string;
    skipDirs?: string[];
}

commander.program
    .argument('<string>', 'Path to directory with patches.')
    .option('--dest <string>', 'Destination directory path.')
    .option('--km <string>', '"Known mods" file path.')
    .option('--skip-dirs <strings...>', 'Directory names to skip.')
    .action(migrate)
    .parseAsync();

async function migrate(
    absSrcDirPath: string,
    { dest: absDestDirPath, km: absKnownModsFilePath, skipDirs = [] }: ProgramOptions,
) {
    absSrcDirPath = path.resolve(absSrcDirPath);
    if (absDestDirPath) absDestDirPath = path.resolve(absDestDirPath);
    if (absKnownModsFilePath) absKnownModsFilePath = path.resolve(absKnownModsFilePath);
    const knownMods: utils.KnownMods | undefined = absKnownModsFilePath
        ? JSON.parse(await fs.readFile(absKnownModsFilePath, 'utf-8'))
        : undefined;
    console.log('Loading files into memory...');
    const patchesDir = await patchesDirVFS.createVFS(absSrcDirPath, skipDirs, knownMods);
    const unmigratableSubdirs = patchesDir.subdirs.filter(
        (subdir) => subdir.errors && Object.keys(subdir.errors).length > 0,
    );

    if (unmigratableSubdirs.length > 0) {
        const filePath = path.resolve('errors.json');

        await fs.writeFile(
            filePath,
            patchesDirVFS.printMigrationErrors(unmigratableSubdirs),
            'utf-8',
        );

        console.log(`Unable to migrate. See ${filePath} for details.`);

        return;
    }

    if (knownMods) {
        console.log('Generating LoadFolders.xml records...');
        // TODO: Implement LoadFolders.xml records generation.
    } else {
        console.log(
            'No known mods file path was provided. Skipping LoadFolders.xml records generation.',
        );
    }

    if (absDestDirPath) {
        console.log('Patching...');

        for (const vSubdir of patchesDir.subdirs) {
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
        }
    } else {
        console.log('No destination directory path was provided. Skipping patching.');
    }

    console.log('Done!');
}
