import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import chalk from 'chalk';
import jsdom from 'jsdom';
import { patchXML, strToXMLFileStr, subtractIndent } from './patcher.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

(await fs.readdir(relPath('tests'))).forEach((fileName) => testFile(fileName));

async function testFile(fileName: string) {
    const testFile = await readFileStr(relPath(`tests/${fileName}`));
    const dom = new jsdom.JSDOM(testFile, { contentType: 'text/xml' });
    const root = dom.window.document.firstElementChild;

    if (root) {
        const desc = root.getAttribute('description');
        let [input, out] = root.querySelectorAll(':scope > Patch');

        if (input && !out && root.getAttribute('outputIsEqualToInput')) out = input;

        if (input && out && desc) {
            subtractIndent(input, 1);
            subtractIndent(out, 1);

            return test(`(${fileName.replace('.xml', '')}) ${desc}`, () => {
                assert.equal(patchXML(input!.outerHTML), strToXMLFileStr(out!.outerHTML));
            });
        }
    }

    throw new Error(`Invalid test file: ${fileName}.`);
}

async function test(name: string, cb: () => void) {
    try {
        await Promise.resolve(cb());
        console.log(`${chalk.green('[PASS]')}: ${name}`);
    } catch (e) {
        console.log(`${chalk.red('[FAIL]')}: ${name}`);
        console.log(e instanceof Error ? e.message : e);
    }
}

async function readFileStr(path: string) {
    return '' + (await fs.readFile(path));
}

function relPath(p: string) {
    return path.join(__dirname.replace('.tsc', 'src'), p);
}
