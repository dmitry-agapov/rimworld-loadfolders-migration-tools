import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import chalk from 'chalk';
import jsdom from 'jsdom';
import * as patcher from '../patcher.js';
import * as utils from '../utils.js';
import * as commander from 'commander';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

commander.program
    .argument('[string]', 'Original files directory path.')
    .argument('[string]', 'Reference files directory path.')
    .action(async (origDirPath?: string, refDirPath?: string) => {
        if (origDirPath && refDirPath) {
            await compareDirs(origDirPath, refDirPath);
        } else {
            const absTestFilePaths = await fs.readdir(relPath('tests'));

            await Promise.all(absTestFilePaths.map(testFile));
        }

        console.log('Done!');
    })
    .parseAsync();

/**
 * The main intent here is to test whether the new version of the patcher produces the same result as the previous one.
 *
 * If it is not, then this probably means that the previous version of patcher was bugged in some way and we need to repatch our files using the new version of the patcher.
 */
async function compareDirs(origDirPath: string, refDirPath: string) {
    const absOrigDirPath = path.resolve(origDirPath);
    const absRefDirPath = path.resolve(refDirPath);
    const refDirContent = await fs.readdir(absRefDirPath, {
        recursive: true,
        encoding: 'utf-8',
    });
    const refFileSubpaths = refDirContent.filter((subpath) =>
        subpath.toLowerCase().endsWith('.xml'),
    );
    const logProgress = utils.createProgressLogger('Comparing', refFileSubpaths.length);

    for (const refFileSubpath of refFileSubpaths) {
        const absRefFilePath = path.join(absRefDirPath, refFileSubpath);
        const [, , ...origFileSubpath] = refFileSubpath.split(path.sep);
        const absOrigFilePath = path.join(absOrigDirPath, ...origFileSubpath);
        logProgress(`...${path.sep}${origFileSubpath.join(path.sep)}`);
        const [refFile, origFile] = await Promise.all([
            fs.readFile(absRefFilePath, 'utf-8'),
            fs.readFile(absOrigFilePath, 'utf-8'),
        ]);

        assert.equal(patcher.patchRawXML(origFile), refFile);
    }
}

async function testFile(fileName: string) {
    const { input, out, desc } = await parseTestFile(fileName);
    const testName = `(${fileName.replace('.xml', '')}) ${desc}`;

    test(testName, () => assert.equal(patcher.patchRawXML(input), utils.strToXMLFileStr(out)));
}

async function parseTestFile(fileName: string) {
    const dom = await jsdom.JSDOM.fromFile(relPath(`tests/${fileName}`), {
        contentType: 'text/xml',
    });
    const root = dom.window.document.documentElement;
    const desc = root.getAttribute('description');
    let [input, out] = utils.getAllDirectChildrenByTagName(root, 'Patch');

    if (!out && root.getAttribute('outputIsEqualToInput')) out = input;

    if (!input || !out || !desc) throw new Error(`Invalid test file: ${fileName}`);

    return { input: fixTestIndent(input.outerHTML), out: fixTestIndent(out.outerHTML), desc };
}

function fixTestIndent(str: string) {
    return utils.mapStrLines(str, (line) => line.replace('\t', ''));
}

function test(name: string, cb: () => void) {
    try {
        cb();
        console.log(`${chalk.green('[PASS]')}: ${name}`);
    } catch (e) {
        console.log(`${chalk.red('[FAIL]')}: ${name}`);

        if (e instanceof assert.AssertionError) {
            console.log(
                [
                    `\n${e.message}\n`,
                    `${chalk.green('Actual')}:`,
                    `${e.actual}\n`,
                    `${chalk.red('Expected')}:`,
                    `${e.expected}\n`,
                ].join('\n'),
            );
        } else {
            console.dir(e);
        }
    }
}

function relPath(p: string) {
    return path.join(__dirname.replace('.tsc', 'src'), p);
}
