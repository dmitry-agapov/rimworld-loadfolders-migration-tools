import fs from 'node:fs/promises';
import path from 'node:path';
import * as commander from 'commander';
import jsdom from 'jsdom';
import * as utils from './utils.js';
import * as ProgressLogger from './ProgressLogger.js';
import * as defaultPaths from './defaultPaths.js';

commander.program
    .argument('<string>', 'Source directory path.')
    .action(async (srcDirPath: string) => {
        const fileSubPaths = await utils.fs.getXMLFileSubPaths(srcDirPath, true);
        const logProgress = ProgressLogger.createProgressLogger('Extracting', fileSubPaths.length);
        const mixedFileSubPaths: string[] = [];

        for (const fileSubPath of fileSubPaths) {
            logProgress(fileSubPath);

            const fileSrcPath = path.join(srcDirPath, fileSubPath);
            const file = await fs.readFile(fileSrcPath, 'utf-8');
            const dom = new jsdom.JSDOM(file, { contentType: 'text/xml' });
            const root = dom.window.document.documentElement;
            const patchOps = utils.dom.getAllDirectChildrenByTagName(
                root,
                utils.patch.ElemTagName.Operation,
            );
            let foundPatchOpAddDef = false;
            let foundOtherPatchOp = false;

            if (patchOps.length === 0) {
                continue;
            }

            for (const patchOp of patchOps) {
                if (isPatchOpAddDef(patchOp)) {
                    foundPatchOpAddDef = true;
                } else {
                    foundOtherPatchOp = true;
                }
            }

            if (foundPatchOpAddDef) {
                if (!foundOtherPatchOp) {
                    const [subDirName, , ...rest] = fileSubPath.split(path.sep);
                    const fileDestPath = path.join(srcDirPath, subDirName!, 'Defs', ...rest);

                    await extractDefsToFile(fileDestPath, dom);

                    await fs.rm(fileSrcPath, { recursive: true });
                } else {
                    mixedFileSubPaths.push(fileSubPath);
                }
            }
        }

        const mixedFilesCount = mixedFileSubPaths.length;

        if (mixedFilesCount > 0) {
            const filePath = defaultPaths.mixedDefsFile;

            await utils.fs.writeJSON(filePath, mixedFileSubPaths);

            console.log(
                `${mixedFilesCount} files contain mixed-in defs. See ${filePath} for details.`,
            );
        }

        console.log('Done!');
    })
    .parseAsync();

function isPatchOpAddDef(elem: Element) {
    const xpathElem = utils.dom.getDirectChildByTagName(elem, utils.patch.ElemTagName.xpath);

    return (
        utils.patch.isPatchOpOfType(elem, utils.patch.PatchOpType.Add) &&
        xpathElem?.textContent?.trim() === 'Defs'
    );
}

async function extractDefsToFile(filePath: string, dom: jsdom.JSDOM) {
    toDefsDoc(dom.window.document);

    const file = utils.xml.toXMLFile(dom.serialize());

    await utils.fs.writeFileRecursive(filePath, file, { flag: 'wx' });
}

function toDefsDoc(doc: Document) {
    const root = doc.documentElement;
    const patchOps = utils.dom.getAllDirectChildrenByTagName(
        root,
        utils.patch.ElemTagName.Operation,
    );

    for (const patchOp of patchOps) {
        unpackPatchOpAdd(patchOp);
    }

    root.replaceWith(utils.dom.changeElemTagName(root, utils.patch.ElemTagName.Defs));
}

function unpackPatchOpAdd(elem: Element) {
    const valueElem = utils.dom.getDirectChildByTagName(elem, utils.patch.ElemTagName.value);

    if (!valueElem) {
        return;
    }

    utils.dom.trimElemContent(valueElem);
    utils.dom.subtractIndent(valueElem, 2);

    elem.replaceWith(...valueElem.childNodes);
}
