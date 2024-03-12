import fs from 'node:fs/promises';
import { EOL } from 'os';
import jsdom from 'jsdom';

const xmlDocDeclaration = '<?xml version="1.0" encoding="utf-8"?>';

enum NodeFilter {
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

export async function patchFile(filePath: string) {
    return fs.writeFile(filePath, patchXML(await fs.readFile(filePath, { encoding: 'utf-8' })));
}

export function patchXML(xmlStr: string): string {
    const dom = new jsdom.JSDOM(xmlStr, { contentType: 'text/xml' });
    const documentElement = dom.window.document.documentElement;

    unpackAllUnnecessaryPatchOpSeq(documentElement);

    unpackAllTopPatchOpFindMod(documentElement);

    return strToXMLFileStr(dom.serialize());
}

function unpackAllTopPatchOpFindMod(root: Element) {
    forEachNodeIn(
        root,
        NodeFilter.SHOW_ELEMENT,
        (node) =>
            node.getAttribute('Class') === 'PatchOperationFindMod' && !isChildOfPatchOpFindMod(node)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT,
        (node) => unpackPatchOpFindMod(node),
    );
}

function unpackPatchOpFindMod(elem: Element) {
    const matchElem = elem.querySelector(':scope > match');

    if (matchElem && !elem.querySelector(':scope > nomatch')) {
        if (matchElem.getAttribute('Class') === 'PatchOperationSequence') {
            unpackPatchOpSeq(matchElem, elem);
        } else {
            subtractIndent(matchElem, 1);

            elem.replaceWith(convertElemTo(matchElem, elem));
        }
    }
}

function isChildOfPatchOpFindMod(elem: Element) {
    if (!elem.parentElement) return false;

    if (elem.parentElement.getAttribute('Class') === 'PatchOperationFindMod') return true;

    return isChildOfPatchOpFindMod(elem.parentElement);
}

function unpackAllUnnecessaryPatchOpSeq(root: Element) {
    forEachNodeIn(
        root,
        NodeFilter.SHOW_ELEMENT,
        (node) =>
            node.getAttribute('Class') === 'PatchOperationSequence' &&
            node.parentElement?.getAttribute('Class') !== 'PatchOperationFindMod' &&
            node.parentElement?.getAttribute('Class') !== 'PatchOperationConditional' &&
            // Double checking just to be sure.
            node.tagName !== 'match' &&
            node.tagName !== 'nomatch'
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT,
        (node) => unpackPatchOpSeq(node),
    );
}

function unpackPatchOpSeq(elem: Element, target: Element = elem) {
    const opsElem = elem.querySelector(':scope > operations');

    if (opsElem) {
        Array.from(opsElem.children).forEach((item) => {
            item.replaceWith(convertElemTo(item, target));
        });

        trimElemContent(opsElem);

        subtractIndent(opsElem, getRelElemDepth(target, opsElem) + 1);

        target.replaceWith(...opsElem.childNodes);
    }
}

function convertElemTo(src: Element, target: Element) {
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

    forEachNodeIn(elem, NodeFilter.SHOW_TEXT + NodeFilter.SHOW_COMMENT, undefined, (node) => {
        if (node.nodeValue) {
            node.nodeValue = node.nodeValue
                .split('\n')
                .map((value) => value.replace('\t'.repeat(amount), ''))
                .join('\n');
        }
    });
}

function forEachNodeIn<
    T extends number | undefined,
    N = T extends NodeFilter.SHOW_ELEMENT ? Element : Node,
>(root: Element, type: T, filter: ((node: N) => number) | undefined, cb: (node: N) => void) {
    const nodeIterator = root.ownerDocument.createNodeIterator(
        root,
        type,
        filter as globalThis.NodeFilter,
    );
    let currentNode;
    const nodes: N[] = [];

    while ((currentNode = nodeIterator.nextNode())) {
        nodes.push(currentNode as N);
    }

    // We do not want to mutate DOM tree while we are still iterating over it.
    nodes.forEach(cb);
}

function getRelElemDepth(elem1: Element, elem2: Element, depth = 0): number {
    if (elem1 !== elem2 && elem2.parentElement) {
        return getRelElemDepth(elem1, elem2.parentElement, depth + 1);
    }

    return depth;
}

function trimElemContent({ firstChild, lastChild, TEXT_NODE }: Element) {
    if (firstChild?.nodeType === TEXT_NODE && firstChild.nodeValue) {
        firstChild.nodeValue = firstChild.nodeValue.trimStart();
    }

    if (lastChild?.nodeType === TEXT_NODE && lastChild.nodeValue) {
        lastChild.nodeValue = lastChild.nodeValue.trimEnd();
    }
}

export function strToXMLFileStr(str: string) {
    return fixEOL(attachXMLDocDecl(str));
}

function attachXMLDocDecl(str: string) {
    return xmlDocDeclaration + '\n' + str;
}

function fixEOL(str: string) {
    return str.replaceAll('\n', EOL);
}