import * as utils from './utils.js';
import jsdom from 'jsdom';

export function patchXML(xml: string): string {
    const dom = new jsdom.JSDOM(xml, { contentType: 'text/xml' });

    patchDOC(dom.window.document);

    return dom.serialize();
}

export function patchDOC(doc: Document) {
    patchTree(doc.documentElement, (elem) => {
        // Unpack all redundant 'PatchOperationSequence'.
        if (isUnpackablePatchOpSeq(elem)) {
            return unpackPatchOpSeq(elem);
        }

        // Unpack all top 'PatchOperationFindMod'.
        if (isUnpackablePatchOpFindMod(elem)) {
            return unpackPatchOpFindMod(elem);
        }

        return undefined;
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
        return unpackPatchOpSeq(matchElem, elem);
    } else {
        utils.dom.shiftElemContentLeft(matchElem, 1);

        return utils.dom.changeElemTagName(matchElem, elem.tagName);
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
    utils.dom.shiftElemContentLeft(opsElem, getRelElemDepth(target, opsElem) + 1);

    return opsElem.childNodes;
}

function getRelElemDepth(elem1: Element, elem2: Element, depth = 0): number {
    if (elem1 === elem2 || !elem2.parentElement) {
        return depth;
    }

    return getRelElemDepth(elem1, elem2.parentElement, depth + 1);
}

/**
 * Algorithm:
 * 1. Traverse tree from bottom to top.
 * 2. Call callback on each element.
 * 3. Replace element with the result (if there is any).
 *
 * From each element we can safely:
 * - Read: up/down
 * - Write: down
 *
 * Example elements visiting order:
 * ```xml
 * <e_7>
 *   <e_2>
 *     <e_1/>
 *   </e_2>
 *   <e_6>
 *     <e_3/>
 *     <e_5>
 *       <e_4/>
 *     </e_5>
 *   </e_6>
 * </e_7>
 * ```
 */
export function patchTree(root: Element, cb: (elem: Element) => Node | Iterable<Node> | undefined) {
    // Conversion to array prevents us from visiting the same element more than once.
    // Because HTMLCollection is "live" and array is not and we are mutating the collection.
    for (const child of [...root.children]) {
        patchTree(child, cb);
    }

    const replacement = cb(root);

    if (replacement) {
        if (Symbol.iterator in replacement) {
            root.replaceWith(...replacement);
        } else {
            root.replaceWith(replacement);
        }
    }
}
