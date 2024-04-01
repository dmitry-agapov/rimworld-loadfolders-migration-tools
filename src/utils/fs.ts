import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export function normalizeEOL(str: string) {
    if (os.EOL === '\n') {
        return str.replaceAll('\r\n', '\n');
    } else if (os.EOL === '\r\n') {
        return str.replaceAll(/(?<!\r)\n/g, '\r\n');
    } else {
        throw new Error('Unsupported EOL.');
    }
}

export async function writeFileRecursive(
    filePath: string,
    file: Parameters<typeof fs.writeFile>[1],
    options?: Parameters<typeof fs.writeFile>[2],
) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file, options);
}

export async function getXMLFileSubPaths(dirPath: string, recursive = false) {
    dirPath = path.normalize(dirPath);

    const dirContent = await fs.readdir(dirPath, {
        recursive,
        withFileTypes: true,
    });
    const filePaths = dirContent.filter(isXMLFileDirEntry).map((entry) => {
        let subPath = path.join(entry.path.replace(dirPath, ''), entry.name);

        if (subPath.startsWith(path.sep)) {
            subPath = subPath.replace(path.sep, '');
        }

        return subPath;
    });

    return filePaths;
}

export function isXMLFileDirEntry(dirEntry: import('node:fs').Dirent) {
    return dirEntry.isFile() && path.extname(dirEntry.name).toLowerCase() === '.xml';
}

export async function getSubDirNames(dirPath: string) {
    const dirContent = await fs.readdir(dirPath, {
        withFileTypes: true,
    });
    const dirNames = dirContent.filter(isDirectoryEntry).map(getDirEntryName);

    return dirNames;
}

export function isDirectoryEntry(dirEntry: import('node:fs').Dirent) {
    return dirEntry.isDirectory();
}

export function getDirEntryName(dirEntry: import('node:fs').Dirent) {
    return dirEntry.name;
}

export async function writeJSON(filePath: string, data: unknown) {
    const file = JSON.stringify(data);

    await fs.writeFile(filePath, file);
}
