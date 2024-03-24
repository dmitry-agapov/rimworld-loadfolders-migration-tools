import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import * as types from './types.js';

export function fixEOL(str: string) {
    return str.replaceAll('\n', os.EOL);
}

export function traverseElemTree(root: Element, cb: (elem: Element) => void) {
    for (const child of root.children) traverseElemTree(child, cb);

    cb(root);
}

/**
 * Replacement for
 * ```js
 * elem.querySelector(':scope > tagName');
 * ```
 * Because as of 18.03.2024 it produces inconsistent results.
 */
export function getDirectChildByTagName(elem: Element, tagName: string) {
    for (const child of elem.children) {
        if (child.tagName === tagName) return child;
    }

    return;
}

export function getAllDirectChildrenByTagName(elem: Element, tagName: string) {
    const result = [];

    for (const child of elem.children) {
        if (child.tagName === tagName) result.push(child);
    }

    return result;
}

export function strToXMLFileStr(str: string) {
    return fixEOL(attachXMLDocDecl(str));
}

export function attachXMLDocDecl(str: string) {
    return '<?xml version="1.0" encoding="utf-8"?>\n' + str;
}

export async function writeFileRecursive(destPath: string, file: string, options?: BufferEncoding) {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, file, options);
}

export function createProgressLogger(taskName: string, total: number) {
    let curr = 0;

    return (addon?: string) => {
        logProgress(taskName, ++curr, total, addon);
    };
}

export function logProgress(taskName: string, curr: number, total: number, addon?: string) {
    const pgBarWidth = 20;
    const pgBarCurrSectionsCount = curr / (total / pgBarWidth);
    const pgBar = '\u25A0'.repeat(pgBarCurrSectionsCount).padEnd(pgBarWidth, '-');
    const percentage = ~~(100 / (total / curr));
    const parts = [`\r${taskName} ${pgBar} ${percentage}%`, `${curr}/${total}`];
    if (addon) parts.push(addon);
    const output = parts
        .join(' | ')
        .slice(0, process.stdout.columns)
        .padEnd(process.stdout.columns);

    process.stdout.write(output);

    if (curr === total) process.stdout.write('\n');
}

export function mapStrLines(str: string, cb: (line: string, index: number) => string) {
    return str.split('\n').map(cb).join('\n');
}

export function isEqSets<T>(set1: Set<T>, set2: Set<T>) {
    return set1.size === set2.size && [...set1].every((item) => set2.has(item));
}

export function escapeXMLStr(unsafe: string): string | undefined {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '&':
                return '&amp;';
            case "'":
                return '&apos;';
            case '"':
                return '&quot;';
            default:
                return c;
        }
    });
}

export function dedupeArray<T>(arr: T[]) {
    return [...new Set<T>(arr)];
}

export function isEmptyObj(obj: {}) {
    return objSize(obj) === 0;
}

export function objSize(obj: {}) {
    return Object.keys(obj).length;
}

export class KnownMods {
    #value: Record<types.ModName, JSONAbleSet<types.ModPackageId>> = {};
    constructor(value: Record<string, string[]>) {
        for (const [k, v] of Object.entries(value)) {
            const modName = k as types.BaseToOpaque<typeof k, types.ModName>;
            const packageIds = v as types.BaseToOpaque<typeof v, types.ModPackageId[]>;

            this.#value[modName] = new JSONAbleSet(packageIds);
        }
    }
    add(name: types.ModName, packageId: types.ModPackageId) {
        if (this.#value[name]) {
            this.#value[name]?.add(packageId);
        } else {
            this.#value[name] = new JSONAbleSet([packageId]);
        }
    }
    get(name: types.ModName): types.ModPackageId[] | undefined {
        const value = this.#value[name];

        return value ? [...value] : undefined;
    }
    getNames() {
        return Object.keys(this.#value);
    }
    toJSON() {
        return this.#value;
    }
    static async fromFile(path: string) {
        return new KnownMods(JSON.parse(await fs.readFile(path, 'utf-8')));
    }
}

export class JSONAbleSet<T> extends Set<T> {
    toJSON() {
        return [...this];
    }
}

export function hasXMLExt(value: string) {
    return path.extname(value).toLowerCase() === '.xml';
}
