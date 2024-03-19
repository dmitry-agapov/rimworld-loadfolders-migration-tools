import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import chalk from 'chalk';
import jsdom from 'jsdom';
import * as patcher from '../patcher.js';
import * as utils from '../utils.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

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

    return { input: input.outerHTML, out: out.outerHTML, desc };
}

function test(name: string, cb: () => void) {
    try {
        cb();
        console.log(`${chalk.green('[PASS]')}: ${name}`);
    } catch (e) {
        console.log(`${chalk.red('[FAIL]')}: ${name}`);
        throw e;
    }
}

function relPath(p: string) {
    return path.join(__dirname.replace('.tsc', 'src'), p);
}

(await fs.readdir(relPath('tests'))).forEach(testFile);
