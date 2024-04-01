import * as utils from './utils.js';
import jsdom from 'jsdom';
import * as types from './types.js';

const enum PatchOpType {
    FindMod = 'PatchOperationFindMod',
    Sequence = 'PatchOperationSequence',
}

export function patchXML(xml: string): string {
    const dom = new jsdom.JSDOM(xml, { contentType: 'text/xml' });

    patchDOC(dom.window.document);

    return dom.serialize();
}

export function patchDOC(doc: Document) {
    utils.dom.traverseElemTree(doc.documentElement, (elem) => {
        // Unpack all unnecessary 'PatchOperationSequence'.
        if (isUnpackablePatchOpSeq(elem)) {
            unpackPatchOpSeq(elem);
        }

        // Unpack all top 'PatchOperationFindMod'.
        if (isUnpackablePatchOpFindMod(elem)) {
            unpackPatchOpFindMod(elem);
        }
    });
}

export function isUnpackablePatchOpFindMod(elem: Element) {
    return (
        isPatchOpOfType(elem, PatchOpType.FindMod) &&
        !utils.dom.getDirectChildByTagName(elem, types.ElemTagName.nomatch) &&
        !isDescendantOfPatchOpFindMod(elem)
    );
}

function isDescendantOfPatchOpFindMod({ parentElement }: Element) {
    if (!parentElement) {
        return false;
    }

    if (isPatchOpOfType(parentElement, PatchOpType.FindMod)) {
        return true;
    }

    return isDescendantOfPatchOpFindMod(parentElement);
}

function unpackPatchOpFindMod(elem: Element) {
    const matchElem = utils.dom.getDirectChildByTagName(elem, types.ElemTagName.match);

    if (!matchElem) {
        return;
    }

    if (isUnpackablePatchOpSeq(matchElem, elem)) {
        unpackPatchOpSeq(matchElem, elem);
    } else {
        subtractIndent(matchElem, 1);

        elem.replaceWith(changeElemTagName(matchElem, elem.tagName));
    }
}

function isUnpackablePatchOpSeq(elem: Element, target: Element = elem) {
    return (
        isPatchOpOfType(elem, PatchOpType.Sequence) &&
        (isTopPatchOp(target) || target.tagName === types.ElemTagName.li)
    );
}

function isTopPatchOp({ tagName, parentElement, ownerDocument }: Element) {
    return (
        tagName === types.ElemTagName.Operation && parentElement === ownerDocument.documentElement
    );
}

function unpackPatchOpSeq(elem: Element, target: Element = elem) {
    const opsElem = utils.dom.getDirectChildByTagName(elem, types.ElemTagName.operations);

    if (!opsElem) {
        return;
    }

    for (const op of opsElem.children) {
        op.replaceWith(changeElemTagName(op, target.tagName));
    }

    trimElemContent(opsElem);

    subtractIndent(opsElem, getRelElemDepth(target, opsElem) + 1);

    target.replaceWith(...opsElem.childNodes);
}

function changeElemTagName(elem: Element, tagName: string) {
    if (elem.tagName === tagName) {
        return elem;
    }

    const newElem = elem.ownerDocument.createElement(tagName);
    const srcElemClassAttrVal = elem.getAttribute('Class');

    if (srcElemClassAttrVal) {
        newElem.setAttribute('Class', srcElemClassAttrVal);
    }

    // Copying nodes, to preserve comments and original formatting
    newElem.replaceChildren(...elem.childNodes);

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
    if (amount === 0) {
        return;
    }

    const substrToSubtract = '\t'.repeat(amount);
    const nodeIterator = elem.ownerDocument.createNodeIterator(
        elem,
        types.NodeFilter.SHOW_TEXT + types.NodeFilter.SHOW_COMMENT,
    );
    let currentNode;

    while ((currentNode = nodeIterator.nextNode())) {
        if (!currentNode.nodeValue) {
            continue;
        }

        currentNode.nodeValue = utils.string.mapLines(currentNode.nodeValue, (line, i) =>
            i > 0 ? line.replace(substrToSubtract, '') : line,
        );
    }
}

function getRelElemDepth(elem1: Element, elem2: Element, depth = 0): number {
    if (elem1 === elem2 || !elem2.parentElement) {
        return depth;
    }

    return getRelElemDepth(elem1, elem2.parentElement, depth + 1);
}

function isPatchOpOfType(elem: Element, type: PatchOpType) {
    return elem.getAttribute('Class') === type;
}
