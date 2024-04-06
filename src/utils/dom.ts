import * as strUtils from './string.js';

export const enum NodeFilter {
    FILTER_ACCEPT = 1,
    FILTER_REJECT = 2,
    FILTER_SKIP = 3,
    SHOW_ALL = 4294967295,
    SHOW_ELEMENT = 1,
    SHOW_ATTRIBUTE = 2,
    SHOW_TEXT = 4,
    SHOW_CDATA_SECTION = 8,
    SHOW_ENTITY_REFERENCE = 16,
    SHOW_ENTITY = 32,
    SHOW_PROCESSING_INSTRUCTION = 64,
    SHOW_COMMENT = 128,
    SHOW_DOCUMENT = 256,
    SHOW_DOCUMENT_TYPE = 512,
    SHOW_DOCUMENT_FRAGMENT = 1024,
    SHOW_NOTATION = 2048,
}

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
export function getChildByTagName(elem: Element, tagName: string) {
    for (const child of elem.children) {
        if (child.tagName === tagName) {
            return child;
        }
    }

    return;
}

export function getChildrenByTagName(elem: Element, tagName: string) {
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
export function trimElemContent({ firstChild, lastChild, TEXT_NODE }: Element) {
    if (firstChild?.nodeType === TEXT_NODE && firstChild.nodeValue) {
        firstChild.nodeValue = firstChild.nodeValue.trimStart();
    }

    if (lastChild?.nodeType === TEXT_NODE && lastChild.nodeValue) {
        lastChild.nodeValue = lastChild.nodeValue.trimEnd();
    }
}
export function subtractIndent(elem: Element, amount = 0) {
    if (amount === 0) {
        return;
    }

    const substrToSubtract = '\t'.repeat(amount);
    const nodeIterator = elem.ownerDocument.createNodeIterator(
        elem,
        NodeFilter.SHOW_TEXT + NodeFilter.SHOW_COMMENT,
    );
    let currentNode;

    while ((currentNode = nodeIterator.nextNode())) {
        if (!currentNode.nodeValue) {
            continue;
        }

        currentNode.nodeValue = strUtils.mapLines(currentNode.nodeValue, (line, i) =>
            i > 0 ? line.replace(substrToSubtract, '') : line,
        );
    }
}

export function changeElemTagName(elem: Element, tagName: string) {
    if (elem.tagName === tagName) {
        return elem;
    }

    const newElem = elem.ownerDocument.createElement(tagName);

    cloneElemAttributes(elem, newElem);

    // Copying nodes, to preserve comments and original formatting
    newElem.replaceChildren(...elem.childNodes);

    return newElem;
}

export function cloneElemAttributes(source: Element, target: Element) {
    for (const attribute of source.attributes) {
        target.setAttribute(attribute.name, attribute.value);
    }
}

export function someChildHasAnyAttr(elem: Element, ...attrNames: string[]) {
    for (const child of elem.children) {
        for (const attrName of attrNames) {
            if (child.attributes.getNamedItem(attrName) !== null) {
                return true;
            }
        }
    }

    return false;
}
