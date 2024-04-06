import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import chalk from 'chalk';
import jsdom from 'jsdom';
import * as patcher from '../patcher.js';
import * as utils from '../utils.js';
import * as commander from 'commander';
import * as ProgressLogger from '../ProgressLogger.js';
import * as diffJs from 'diff';
import process from 'node:process';

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
    const fails: string[] = [];

    for (const refDirFilePath of refDirFilePaths) {
        const [, , ...origFileSubPathParts] = refDirFilePath.split(path.sep);
        const origFileSubPath = origFileSubPathParts.join(path.sep);

        logProgress(`...${path.sep}${origFileSubPath}`);

        const refFilePath = path.join(refFilesDirPath, refDirFilePath);
        const origFilePath = path.join(origFilesDirPath, origFileSubPath);
        let [refFile, origFile] = await Promise.all([
            fs.readFile(refFilePath, 'utf-8'),
            fs.readFile(origFilePath, 'utf-8'),
        ]);
        const patchedOrigFile = utils.xml.toXMLFile(patcher.patchXML(origFile));

        try {
            // We do not normalize EOL of ref file because doing so could produce false positive results
            assert.equal(patchedOrigFile, refFile);
        } catch (error) {
            logTestFail(origFileSubPath, error);

            fails.push(origFileSubPath);

            process.stdout.write('Press ENTER to continue...');

            await new Promise((resolve) => process.stdin.once('data', resolve));
        }
    }

    if (fails.length > 0) {
        console.log([`${fails.length} files don't match:`, ...fails].join('\n\t'));
    }
}

async function testFile(filePath: string) {
    const { input, out, desc } = await parseTestFile(filePath);
    const testDescription = `(${path.basename(filePath, '.xml')}) ${desc}`;

    test(testDescription, () => {
        assert.equal(patcher.patchXML(input), out);
    });
}

async function parseTestFile(filePath: string) {
    const dom = await jsdom.JSDOM.fromFile(relPath(`tests/${filePath}`), {
        contentType: 'text/xml',
    });
    const root = dom.window.document.documentElement;
    const desc = root.getAttribute('description');
    let [input, out] = utils.dom.getChildrenByTagName(root, utils.patch.ElemTagName.Patch);

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

function test(description: string, cb: () => void) {
    try {
        cb();

        logTestPass(description);
    } catch (error) {
        logTestFail(description, error);
    }
}

function logTestPass(description: string) {
    console.log(chalk.green('[PASS]') + ': ' + description);
}

function logTestFail(description: string, error: unknown) {
    console.log(chalk.red('[FAIL]') + ': ' + description);

    logError(error);
}

function relPath(p: string) {
    return path.join(__dirname.replace('.tsc', 'src'), p);
}

function logError(error: unknown) {
    if (error instanceof assert.AssertionError) {
        console.log(printAssertionError(error).replaceAll('\t', '    '));
    } else {
        console.dir(error);
    }
}

function printAssertionError(error: import('node:assert').AssertionError) {
    if (typeof error.expected === 'string' && typeof error.actual === 'string') {
        const diff = diffJs.diffLines(error.expected, error.actual);

        return printLinesDiff(diff);
    }

    return error.message;
}

function printLinesDiff(diff: diffJs.Change[]) {
    return diff.map(printLinesDiffChange).join('');
}

function printLinesDiffChange(change: diffJs.Change) {
    if (change.added) {
        return chalk.bgGreen(change.value);
    } else if (change.removed) {
        return chalk.bgRed(change.value);
    } else if (change.count && change.count > 11) {
        const lines = change.value.split('\n');
        const head = lines.slice(0, 5);
        const tail = lines.slice(lines.length - 6);

        return [
            ...head,
            utils.string.padBoth(
                chalk.bgCyan(`... ${lines.length - 10} lines were skipped ...`),
                process.stdout.columns,
            ),
            ...tail,
        ].join('\n');
    }

    return change.value;
}
