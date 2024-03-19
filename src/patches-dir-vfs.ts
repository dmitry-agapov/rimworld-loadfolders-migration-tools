import fs from 'node:fs/promises';
import path from 'node:path';
import jsdom from 'jsdom';
import * as utils from './utils.js';

/*
	!IMPORTANT!
	We do not skip 'empty' files, because we want them to be copied during patching process.
*/

interface VFSRoot {
    readonly path: string;
    readonly subdirs: VFSSubdir[];
}

interface VFSSubdir {
    readonly name: string;
    readonly files: VFSFile[];
    readonly modSets: utils.SetOfSets<string>;
    readonly errors: (
        | VFSSubdirNoModsError
        | VFSSubdirIsPatchCollectionError
        | VFSSubdirUnidentModsFoundError
    )[];
}

enum VFSSubdirErrorType {
    NO_MODS = 'NO_MODS',
    IS_COLLECTION = 'IS_COLLECTION',
    UNIDENT_MODS_FOUND = 'UNIDENT_MODS_FOUND',
}

class VFSSubdirNoModsError {
    readonly type = VFSSubdirErrorType.NO_MODS;
    readonly description = 'Directory does not contain patches for any mod.';
}

class VFSSubdirIsPatchCollectionError {
    readonly type = VFSSubdirErrorType.IS_COLLECTION;
    readonly description = 'Directory contains files that apply patches to different sets of mods.';
    readonly details: {
        modSets: utils.SetOfSets<string>;
        files: string[];
    }[];
    constructor(details: VFSSubdirIsPatchCollectionError['details']) {
        this.details = details;
    }
}

class VFSSubdirUnidentModsFoundError {
    readonly type = VFSSubdirErrorType.UNIDENT_MODS_FOUND;
    readonly description = 'Unidentified mods found.';
    readonly details: string[];
    constructor(details: VFSSubdirUnidentModsFoundError['details']) {
        this.details = details;
    }
}

interface VFSFile {
    readonly subpath: string;
    readonly dom: jsdom.JSDOM;
    readonly modSets: utils.SetOfSets<string>;
}

export async function createVFS(
    absSrcDirPath: string,
    skipSubdirs: string[],
    knownMods?: utils.KnownMods,
): Promise<VFSRoot> {
    const subdirNames = await fs.readdir(absSrcDirPath, 'utf-8');
    const subdirs = await Promise.all(
        subdirNames
            .filter((subdirName) => !skipSubdirs.includes(subdirName))
            .map((subdirName) => createVSubdir(absSrcDirPath, subdirName, knownMods)),
    );

    return {
        path: absSrcDirPath,
        subdirs,
    };
}

async function createVSubdir(
    absParentDirPath: string,
    name: string,
    knownMods?: utils.KnownMods,
): Promise<VFSSubdir> {
    const absDirPath = path.join(absParentDirPath, name);
    const dirContent = await fs.readdir(absDirPath, { recursive: true, encoding: 'utf-8' });
    const fileSubpaths = dirContent.filter((fileSubpath) =>
        fileSubpath.toLowerCase().endsWith('.xml'),
    );
    const modSets = new utils.SetOfSets<string>();
    const files = await Promise.all(
        fileSubpaths.map(async (fileSubpath) => {
            const vFile = await createVFile(absDirPath, fileSubpath);

            modSets.mergeWith(vFile.modSets);

            return vFile;
        }),
    );
    const errors: VFSSubdir['errors'] = [];

    if (modSets.size === 0) errors.push(new VFSSubdirNoModsError());

    if (modSets.size > 1) {
        const details: VFSSubdirIsPatchCollectionError['details'] = [];

        for (const file of files) {
            const detailsRecord = details.find((item) => item.modSets.isEqualTo(file.modSets));

            if (detailsRecord) {
                detailsRecord.files.push(file.subpath);
            } else {
                details.push({
                    modSets: file.modSets,
                    files: [file.subpath],
                });
            }
        }

        errors.push(new VFSSubdirIsPatchCollectionError(details));
    }

    if (knownMods) {
        const unidentifiedMods: string[] = [];

        for (const modName of new Set(modSets.toArrayDeep().flat())) {
            if (!knownMods[modName]) unidentifiedMods.push(modName);
        }

        if (unidentifiedMods.length > 0) {
            errors.push(new VFSSubdirUnidentModsFoundError(unidentifiedMods));
        }
    }

    return {
        name,
        files,
        modSets,
        errors,
    };
}

async function createVFile(absParentDirPath: string, subpath: string): Promise<VFSFile> {
    const absFilePath = path.join(absParentDirPath, subpath);
    const file = await fs.readFile(absFilePath);
    const dom = new jsdom.JSDOM(file, { contentType: 'text/xml' });
    const modSets = extractModSetsFromDoc(dom.window.document);

    return {
        subpath,
        dom,
        modSets,
    };
}

function extractModSetsFromDoc(doc: Document) {
    const result = new utils.SetOfSets<string>();

    utils.traverseElemTree(doc.documentElement, (elem) => {
        if (utils.isUnpackablePOFM(elem)) result.add(extractModSetFromPOFM(elem));
    });

    return result;
}

function extractModSetFromPOFM(elem: Element) {
    const result = new Set<string>();
    const modsElem = utils.getDirectChildByTagName(elem, 'mods');

    if (!modsElem) return result;

    const modEntries = utils.getAllDirectChildrenByTagName(modsElem, 'li');

    for (const modEntry of modEntries) {
        if (!modEntry.textContent) continue;

        result.add(modEntry.textContent.trim());
    }

    return result;
}

export function printMigrationErrors(unmigratableSubdirs: VFSSubdir[]) {
    const errors: {
        [key: string]: VFSSubdir['errors'];
    } = {};

    unmigratableSubdirs.forEach((subdir) => {
        errors[subdir.name] = subdir.errors;
    });

    const json = JSON.stringify(
        errors,
        (_, value) => {
            if (value instanceof utils.SetOfSets) {
                const arr = value.toArrayDeep();

                return arr.map((item) => (item.length === 1 ? item[0] : item));
            }

            return value;
        },
        '\t',
    );

    return utils.fixEOL(json);
}
