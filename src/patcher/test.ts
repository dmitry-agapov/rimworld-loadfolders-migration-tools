import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import chalk from 'chalk';
import jsdom from 'jsdom';
import * as patcher from '../patcher.js';
import * as utils from '../utils.js';
import * as commander from 'commander';
import * as types from '../types.js';
import * as ProgressLogger from '../ProgressLogger.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

commander.program
    .argument('[string]', 'Original files directory path.')
    .argument('[string]', 'Reference files directory path.')
    .action(async (origFilesDirPath?: string, refFilesDirPath?: string) => {
        if (origFilesDirPath && refFilesDirPath) {
            await compareDirs(origFilesDirPath, refFilesDirPath);
        } else {
            const testFilePaths = await utils.fs.getXMLFileSubPaths(relPath('tests'));

            for (const testFilePath of testFilePaths) {
                await testFile(testFilePath);
            }
        }

        console.log('Done!');
    })
    .parseAsync();

/**
 * The main intent here is to test whether the new version of the patcher produces the same result as the previous one.
 *
 * If it is not, then this probably means that the previous version of patcher was bugged in some way and we need to repatch our files using the new version of the patcher.
 */
async function compareDirs(origFilesDirPath: string, refFilesDirPath: string) {
    const refDirFilePaths = await utils.fs.getXMLFileSubPaths(refFilesDirPath, true);
    const logProgress = ProgressLogger.createProgressLogger('Comparing', refDirFilePaths.length);

    for (const refDirFilePath of refDirFilePaths) {
        const [, , ...origFileSubPath] = refDirFilePath.split(path.sep);

        logProgress(`...${path.sep}${origFileSubPath.join(path.sep)}`);

        const refFilePath = path.join(refFilesDirPath, refDirFilePath);
        const origFilePath = path.join(origFilesDirPath, ...origFileSubPath);
        const [refFile, origFile] = await Promise.all([
            fs.readFile(refFilePath, 'utf-8'),
            fs.readFile(origFilePath, 'utf-8'),
        ]);

        // We do not normalize EOL of ref file because doing so could produce false positive results
        assert.equal(utils.xml.toXMLFile(patcher.patchXML(origFile)), refFile);
    }
}

async function testFile(filePath: string) {
    const { input, out, desc } = await parseTestFile(filePath);
    const testName = `(${path.basename(filePath, '.xml')}) ${desc}`;

    test(testName, () => {
        assert.equal(patcher.patchXML(input), out);
    });
}

async function parseTestFile(filePath: string) {
    const dom = await jsdom.JSDOM.fromFile(relPath(`tests/${filePath}`), {
        contentType: 'text/xml',
    });
    const root = dom.window.document.documentElement;
    const desc = root.getAttribute('description');
    let [input, out] = utils.dom.getAllDirectChildrenByTagName(root, types.ElemTagName.Patch);

    if (!out && root.getAttribute('outputIsEqualToInput')) {
        out = input;
    }

    if (!input || !out || !desc) {
        throw new Error(`Invalid test file: ${filePath}`);
    }

    return {
        input: fixTestIndent(input.outerHTML),
        out: fixTestIndent(out.outerHTML),
        desc,
    };
}

function fixTestIndent(str: string) {
    return utils.string.mapLines(str, (line) => line.replace('\t', ''));
}

function test(name: string, cb: () => void) {
    try {
        cb();
        console.log(`${chalk.green('[PASS]')}: ${name}`);
    } catch (error) {
        console.log(`${chalk.red('[FAIL]')}: ${name}`);

        if (error instanceof assert.AssertionError) {
            console.log(printAssertionError(error));
        } else {
            console.dir(error);
        }
    }
}

function relPath(p: string) {
    return path.join(__dirname.replace('.tsc', 'src'), p);
}

function printAssertionError(error: import('node:assert').AssertionError) {
    return [
        `\n${error.message}\n`,
        `${chalk.green('Actual')}:`,
        `${error.actual}\n`,
        `${chalk.red('Expected')}:`,
        `${error.expected}\n`,
    ].join('\n');
}
