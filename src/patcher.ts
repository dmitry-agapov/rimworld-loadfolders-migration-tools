import * as utils from './utils.js';
import jsdom from 'jsdom';

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
    const isPatchOpFindMod = utils.patch.isPatchOpOfType(elem, utils.patch.PatchOpType.FindMod);

    if (isPatchOpFindMod && !isDescendantOfPatchOpFindMod(elem) && elem.children.length === 2) {
        const modsElem = utils.dom.getChildByTagName(elem, utils.patch.ElemTagName.mods);
        const matchElem = utils.dom.getChildByTagName(elem, utils.patch.ElemTagName.match);

        if (modsElem && matchElem) {
            return true;
        }
    }

    return false;
}

function isDescendantOfPatchOpFindMod({ parentElement }: Element) {
    if (!parentElement) {
        return false;
    }

    if (utils.patch.isPatchOpOfType(parentElement, utils.patch.PatchOpType.FindMod)) {
        return true;
    }

    return isDescendantOfPatchOpFindMod(parentElement);
}

function unpackPatchOpFindMod(elem: Element) {
    const matchElem = utils.dom.getChildByTagName(elem, utils.patch.ElemTagName.match);

    if (!matchElem) {
        return;
    }

    if (isUnpackablePatchOpSeq(matchElem, elem)) {
        unpackPatchOpSeq(matchElem, elem);
    } else {
        utils.dom.subtractIndent(matchElem, 1);

        elem.replaceWith(utils.dom.changeElemTagName(matchElem, elem.tagName));
    }
}

function isUnpackablePatchOpSeq(elem: Element, target: Element = elem) {
    const isPatchOpSeq = utils.patch.isPatchOpOfType(elem, utils.patch.PatchOpType.Sequence);

    if (isPatchOpSeq) {
        const opsElem = utils.dom.getChildByTagName(elem, utils.patch.ElemTagName.operations);

        if (
            opsElem &&
            ![...opsElem.children].some((op) =>
                utils.patch.isPatchOpOfType(op, utils.patch.PatchOpType.Test),
            )
        ) {
            const isDirectlyNestedInPatchOpSeq =
                target.parentElement?.parentElement?.getAttribute('Class') ===
                utils.patch.PatchOpType.Sequence;
            const canBeUnpackedAsTopPatchOp =
                isTopPatchOp(target) &&
                !utils.dom.someChildHasAnyAttr(opsElem, 'MayRequire', 'MayRequireAnyOf');

            if (isDirectlyNestedInPatchOpSeq || canBeUnpackedAsTopPatchOp) {
                return true;
            }
        }
    }

    return false;
}

function isTopPatchOp({ tagName, parentElement, ownerDocument }: Element) {
    return (
        tagName === utils.patch.ElemTagName.Operation &&
        parentElement === ownerDocument.documentElement
    );
}

function unpackPatchOpSeq(elem: Element, target: Element = elem) {
    const opsElem = utils.dom.getChildByTagName(elem, utils.patch.ElemTagName.operations);

    if (!opsElem) {
        return;
    }

    for (const op of opsElem.children) {
        op.replaceWith(utils.dom.changeElemTagName(op, target.tagName));
    }

    utils.dom.trimElemContent(opsElem);
    utils.dom.subtractIndent(opsElem, getRelElemDepth(target, opsElem) + 1);

    target.replaceWith(...opsElem.childNodes);
}

function getRelElemDepth(elem1: Element, elem2: Element, depth = 0): number {
    if (elem1 === elem2 || !elem2.parentElement) {
        return depth;
    }

    return getRelElemDepth(elem1, elem2.parentElement, depth + 1);
}
