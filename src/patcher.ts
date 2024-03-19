import * as utils from './utils.js';
import jsdom from 'jsdom';

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
        if (utils.isUnpackablePOFM(elem)) unpackPOFM(elem);
    });
}

function unpackPOFM(elem: Element) {
    const matchElem = utils.getDirectChildByTagName(elem, 'match');

    if (!matchElem) return;

    if (matchElem.getAttribute('Class') === 'PatchOperationSequence') {
        unpackPOS(matchElem, elem);
    } else {
        utils.subtractIndent(matchElem, 1);

        elem.replaceWith(utils.convertElemTo(matchElem, elem));
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

    for (const op of opsElem.children) op.replaceWith(utils.convertElemTo(op, target));

    utils.trimElemContent(opsElem);

    utils.subtractIndent(opsElem, utils.getRelElemDepth(target, opsElem) + 1);

    target.replaceWith(...opsElem.childNodes);
}
