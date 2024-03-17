import fs from 'node:fs';
import path from 'node:path';
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

export function patchDir(srcDirPath: string, destDirPath: string = srcDirPath) {
    srcDirPath = path.resolve(srcDirPath);
    destDirPath = path.resolve(destDirPath);
    const dirContent = fs.readdirSync(srcDirPath, { recursive: true, encoding: 'utf-8' });
    const filePaths = dirContent.filter((item) => item.toLowerCase().endsWith('.xml'));
    const logProgress = createProgressLogger('Patching', filePaths.length);

    for (const filePath of filePaths) {
        const srcPath = path.join(srcDirPath, filePath);
        const patchedFile = patchFile(srcPath);
        const destPath = path.join(destDirPath, filePath);

        writeFileSyncRecursive(destPath, patchedFile);

        logProgress(1);
    }

    console.log('Done!');
}

function patchFile(filePath: string) {
    return patchXML(fs.readFileSync(filePath));
}

export function patchXML(xml: string | Buffer): string {
    const dom = new jsdom.JSDOM(xml, { contentType: 'text/xml' });

    traverseElemTree(dom.window.document.documentElement, (elem) => {
        // Unpack all unnecessary 'PatchOperationSequence'.
        if (isUnpackablePatchOpSeq(elem)) unpackPatchOpSeq(elem);

        // Unpack all top 'PatchOperationFindMod'.
        if (isUnpackablePatchOpFindMod(elem)) unpackPatchOpFindMod(elem);
    });

    return strToXMLFileStr(dom.serialize());
}

function isUnpackablePatchOpFindMod(elem: Element) {
    return (
        elem.getAttribute('Class') === 'PatchOperationFindMod' &&
        !isDescendantOfPatchOpFindMod(elem)
    );
}

function isDescendantOfPatchOpFindMod({ parentElement }: Element) {
    if (!parentElement) return false;

    if (parentElement.getAttribute('Class') === 'PatchOperationFindMod') return true;

    return isDescendantOfPatchOpFindMod(parentElement);
}

function unpackPatchOpFindMod(elem: Element) {
    const matchElem = elem.querySelector(':scope > match');

    if (!matchElem || elem.querySelector(':scope > nomatch')) return;

    if (matchElem.getAttribute('Class') === 'PatchOperationSequence') {
        unpackPatchOpSeq(matchElem, elem);
    } else {
        subtractIndent(matchElem, 1);

        elem.replaceWith(convertElemTo(matchElem, elem));
    }
}

function isUnpackablePatchOpSeq(elem: Element) {
    return (
        elem.getAttribute('Class') === 'PatchOperationSequence' &&
        elem.parentElement?.getAttribute('Class') !== 'PatchOperationFindMod' &&
        elem.parentElement?.getAttribute('Class') !== 'PatchOperationConditional' &&
        // Double checking just to be sure.
        elem.tagName !== 'match' &&
        elem.tagName !== 'nomatch'
    );
}

function unpackPatchOpSeq(elem: Element, target: Element = elem) {
    const opsElem = elem.querySelector(':scope > operations');

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

function subtractIndent(elem: Element, amount = 0) {
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

function mapStrLines(str: string, cb: (line: string, index: number) => string) {
    return str.split('\n').map(cb).join('\n');
}

function traverseElemTree(root: Element, cb: (elem: Element) => void) {
    for (const child of root.children) traverseElemTree(child, cb);

    cb(root);
}

function getRelElemDepth(elem1: Element, elem2: Element, depth = 0): number {
    if (elem1 === elem2 || !elem2.parentElement) return depth;

    return getRelElemDepth(elem1, elem2.parentElement, depth + 1);
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

function writeFileSyncRecursive(destPath: string, file: string) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, file);
}

function createProgressLogger(taskName: string, total: number) {
    let curr = 0;

    return (progress: number = 0) => logProgress(taskName, (curr = curr + progress), total);
}

function logProgress(taskName: string, curr: number, total: number) {
    const pgBarWidth = 20;
    const pgBarCurrSectionsCount = curr / (total / pgBarWidth);
    const pgBar = '\u25A0'.repeat(pgBarCurrSectionsCount).padEnd(pgBarWidth, '-');
    const percentage = ~~(100 / (total / curr));
    const counter = `${curr}/${total}`;

    process.stdout.write(`\r${taskName} ${pgBar} ${percentage}% | ${counter}`);

    if (curr === total) process.stdout.write('\n');
}
