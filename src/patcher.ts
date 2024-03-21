import * as utils from './utils.js';
import jsdom from 'jsdom';
import * as types from './types.js';

export function patchRawXML(xml: string | Buffer): string {
    const dom = new jsdom.JSDOM(xml, { contentType: 'text/xml' });

    patchDOC(dom.window.document);

    return utils.strToXMLFileStr(dom.serialize());
}

export function patchDOC(doc: Document) {
    utils.traverseElemTree(doc.documentElement, (elem) => {
        // Unpack all unnecessary 'PatchOperationSequence'.
        if (isUnpackablePOS(elem)) unpackPOS(elem);

        // Unpack all top 'PatchOperationFindMod'.
        if (isUnpackablePOFM(elem)) unpackPOFM(elem);
    });
}

export function isUnpackablePOFM(elem: Element) {
    return (
        elem.getAttribute('Class') === 'PatchOperationFindMod' &&
        !utils.getDirectChildByTagName(elem, 'nomatch') &&
        !isDescendantOfPOFM(elem)
    );
}

function isDescendantOfPOFM({ parentElement }: Element) {
    if (!parentElement) return false;

    if (parentElement.getAttribute('Class') === 'PatchOperationFindMod') return true;

    return isDescendantOfPOFM(parentElement);
}

function unpackPOFM(elem: Element) {
    const matchElem = utils.getDirectChildByTagName(elem, 'match');

    if (!matchElem) return;

    if (matchElem.getAttribute('Class') === 'PatchOperationSequence') {
        unpackPOS(matchElem, elem);
    } else {
        subtractIndent(matchElem, 1);

        elem.replaceWith(convertElemTo(matchElem, elem));
    }
}

function isUnpackablePOS(elem: Element) {
    return (
        elem.getAttribute('Class') === 'PatchOperationSequence' &&
        elem.parentElement?.getAttribute('Class') !== 'PatchOperationFindMod' &&
        elem.parentElement?.getAttribute('Class') !== 'PatchOperationConditional' &&
        // Double checking just to be sure.
        elem.tagName !== 'match' &&
        elem.tagName !== 'nomatch'
    );
}

function unpackPOS(elem: Element, target: Element = elem) {
    const opsElem = utils.getDirectChildByTagName(elem, 'operations');

    if (!opsElem) return;

    for (const op of opsElem.children) op.replaceWith(convertElemTo(op, target));

    trimElemContent(opsElem);

    subtractIndent(opsElem, getRelElemDepth(target, opsElem) + 1);

    target.replaceWith(...opsElem.childNodes);
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

function trimElemContent({ firstChild, lastChild, TEXT_NODE }: Element) {
    if (firstChild?.nodeType === TEXT_NODE && firstChild.nodeValue) {
        firstChild.nodeValue = firstChild.nodeValue.trimStart();
    }

    if (lastChild?.nodeType === TEXT_NODE && lastChild.nodeValue) {
        lastChild.nodeValue = lastChild.nodeValue.trimEnd();
    }
}

function subtractIndent(elem: Element, amount = 0) {
    if (amount === 0) return;

    const substrToSubtract = '\t'.repeat(amount);
    const nodeIterator = elem.ownerDocument.createNodeIterator(
        elem,
        types.NodeFilter.SHOW_TEXT + types.NodeFilter.SHOW_COMMENT,
    );
    let currentNode;

    while ((currentNode = nodeIterator.nextNode())) {
        if (!currentNode.nodeValue) continue;

        currentNode.nodeValue = utils.mapStrLines(currentNode.nodeValue, (line, i) =>
            i > 0 ? line.replace(substrToSubtract, '') : line,
        );
    }
}

function getRelElemDepth(elem1: Element, elem2: Element, depth = 0): number {
    if (elem1 === elem2 || !elem2.parentElement) return depth;

    return getRelElemDepth(elem1, elem2.parentElement, depth + 1);
}
