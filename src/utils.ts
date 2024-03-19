import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const xmlDocDeclaration = '<?xml version="1.0" encoding="utf-8"?>';

export enum NodeFilter {
    FILTER_ACCEPT = 1,
    FILTER_REJECT = 2,
    FILTER_SKIP = 3,
    SHOW_ALL = 0xffffffff,
    SHOW_ELEMENT = 0x1,
    SHOW_ATTRIBUTE = 0x2,
    SHOW_TEXT = 0x4,
    SHOW_CDATA_SECTION = 0x8,
    SHOW_ENTITY_REFERENCE = 0x10,
    SHOW_ENTITY = 0x20,
    SHOW_PROCESSING_INSTRUCTION = 0x40,
    SHOW_COMMENT = 0x80,
    SHOW_DOCUMENT = 0x100,
    SHOW_DOCUMENT_TYPE = 0x200,
    SHOW_DOCUMENT_FRAGMENT = 0x400,
    SHOW_NOTATION = 0x800,
}

export function fixEOL(str: string) {
    return str.replaceAll('\n', os.EOL);
}

export function traverseElemTree(root: Element, cb: (elem: Element) => void) {
    for (const child of root.children) traverseElemTree(child, cb);

    cb(root);
}

export function isDescendantOfPOFM({ parentElement }: Element) {
    if (!parentElement) return false;

    if (parentElement.getAttribute('Class') === 'PatchOperationFindMod') return true;

    return isDescendantOfPOFM(parentElement);
}

export function isUnpackablePOFM(elem: Element) {
    return (
        elem.getAttribute('Class') === 'PatchOperationFindMod' &&
        !getDirectChildByTagName(elem, 'nomatch') &&
        !isDescendantOfPOFM(elem)
    );
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
    return xmlDocDeclaration + '\n' + str;
}

export async function writeFileRecursive(destPath: string, file: string, options?: BufferEncoding) {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, file, options);
}

export function createProgressLogger(taskName: string, total: number) {
    let curr = 0;

    return (progress: number = 0) => logProgress(taskName, (curr = curr + progress), total);
}

export function logProgress(taskName: string, curr: number, total: number) {
    const pgBarWidth = 20;
    const pgBarCurrSectionsCount = curr / (total / pgBarWidth);
    const pgBar = '\u25A0'.repeat(pgBarCurrSectionsCount).padEnd(pgBarWidth, '-');
    const percentage = ~~(100 / (total / curr));
    const counter = `${curr}/${total}`;

    process.stdout.write(`\r${taskName} ${pgBar} ${percentage}% | ${counter}`);

    if (curr === total) process.stdout.write('\n');
}

export function convertElemTo(src: Element, target: Element) {
    if (src.tagName === target.tagName) return src;

    const newElem = src.ownerDocument.createElement(target.tagName);
    const srcElemClassAttrVal = src.getAttribute('Class');

    if (srcElemClassAttrVal) newElem.setAttribute('Class', srcElemClassAttrVal);

    // Copying nodes, to preserve comments and original formatting
    newElem.replaceChildren(...src.childNodes);

    return newElem;
}

export function subtractIndent(elem: Element, amount = 0) {
    if (amount === 0) return;

    const substrToSubtract = '\t'.repeat(amount);
    const nodeIterator = elem.ownerDocument.createNodeIterator(
        elem,
        NodeFilter.SHOW_TEXT + NodeFilter.SHOW_COMMENT,
    );
    let currentNode;

    while ((currentNode = nodeIterator.nextNode())) {
        if (!currentNode.nodeValue) continue;

        currentNode.nodeValue = mapStrLines(currentNode.nodeValue, (line, i) =>
            i > 0 ? line.replace(substrToSubtract, '') : line,
        );
    }
}

export function mapStrLines(str: string, cb: (line: string, index: number) => string) {
    return str.split('\n').map(cb).join('\n');
}

export function getRelElemDepth(elem1: Element, elem2: Element, depth = 0): number {
    if (elem1 === elem2 || !elem2.parentElement) return depth;

    return getRelElemDepth(elem1, elem2.parentElement, depth + 1);
}

export function trimElemContent({ firstChild, lastChild, TEXT_NODE }: Element) {
    if (firstChild?.nodeType === TEXT_NODE && firstChild.nodeValue) {
        firstChild.nodeValue = firstChild.nodeValue.trimStart();
    }

    if (lastChild?.nodeType === TEXT_NODE && lastChild.nodeValue) {
        lastChild.nodeValue = lastChild.nodeValue.trimEnd();
    }
}

export class SetOfSets<T> {
    #sets: Set<T>[] = [];
    add(value: Set<T>) {
        if (!this.#sets.find((item) => isEqSets(item, value))) this.#sets.push(value);
    }
    forEach(cb: (v: Set<T>) => void) {
        this.#sets.forEach(cb);
    }
    mergeWith(set: SetOfSets<T>) {
        set.forEach((item) => this.add(item));
    }
    toArrayDeep() {
        return this.#sets.map((item) => [...item]);
    }
    isEqualTo(set: SetOfSets<T>) {
        return this.size === set.size && this.#sets.every((item) => set.has(item));
    }
    has(value: Set<T>) {
        return !!this.#sets.find((item) => isEqSets(item, value));
    }
    get size() {
        return this.#sets.length;
    }
}

export function isEqSets<T>(set1: Set<T>, set2: Set<T>) {
    return set1.size === set2.size && [...set1].every((item) => set2.has(item));
}

export interface KnownMods {
    [key: string]: string;
}

export type Mutable<T> = {
    -readonly [Property in keyof T]: T[Property];
};
