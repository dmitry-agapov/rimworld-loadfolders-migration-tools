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
        if (isUnpackablePatchOpSeq(elem)) unpackPatchOpSeq(elem);

        // Unpack all top 'PatchOperationFindMod'.
        if (isUnpackablePatchOpFindMod(elem)) unpackPatchOpFindMod(elem);
    });
}

export function isUnpackablePatchOpFindMod(elem: Element) {
    return (
        isPatchOpOfType(elem, types.PatchOpType.FindMod) &&
        !utils.getDirectChildByTagName(elem, types.ElemTagName.nomatch) &&
        !isDescendantOfPatchOpFindMod(elem)
    );
}

function isDescendantOfPatchOpFindMod({ parentElement }: Element) {
    if (!parentElement) return false;

    if (isPatchOpOfType(parentElement, types.PatchOpType.FindMod)) return true;

    return isDescendantOfPatchOpFindMod(parentElement);
}

function unpackPatchOpFindMod(elem: Element) {
    const matchElem = utils.getDirectChildByTagName(elem, types.ElemTagName.match);

    if (!matchElem) return;

    if (isUnpackablePatchOpSeq(matchElem, elem)) {
        unpackPatchOpSeq(matchElem, elem);
    } else {
        subtractIndent(matchElem, 1);

        elem.replaceWith(convertElemTo(matchElem, elem));
    }
}

function isUnpackablePatchOpSeq(elem: Element, target: Element = elem) {
    return (
        isPatchOpOfType(elem, types.PatchOpType.Sequence) &&
        (isTopPatchOp(target) || target.tagName === types.ElemTagName.li)
    );
}

function isTopPatchOp({ tagName, parentElement, ownerDocument }: Element) {
    return (
        tagName === types.ElemTagName.Operation && parentElement === ownerDocument.documentElement
    );
}

function unpackPatchOpSeq(elem: Element, target: Element = elem) {
    const opsElem = utils.getDirectChildByTagName(elem, types.ElemTagName.operations);

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

function isPatchOpOfType(elem: Element, type: types.PatchOpType) {
    return elem.getAttribute('Class') === type;
}
