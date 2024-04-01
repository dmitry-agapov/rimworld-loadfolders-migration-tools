import * as types from '../types.js';

export function traverseElemTree(root: Element, cb: (elem: Element) => void) {
    for (const child of root.children) {
        traverseElemTree(child, cb);
    }

    cb(root);
}

/**
 * Replacement for
 * ```js
 * elem.querySelector(':scope > tagName');
 * ```
 * Because as of 18.03.2024 it produces inconsistent results.
 */
export function getDirectChildByTagName(elem: Element, tagName: types.ElemTagName) {
    for (const child of elem.children) {
        if (child.tagName === tagName) {
            return child;
        }
    }

    return;
}

export function getAllDirectChildrenByTagName(elem: Element, tagName: types.ElemTagName) {
    const result = [];

    for (const child of elem.children) {
        if (child.tagName === tagName) {
            result.push(child);
        }
    }

    return result;
}

export function escapeStr(unsafe: string): string {
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
