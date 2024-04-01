import jsdom from 'jsdom';
import * as types from './types.js';
import * as utils from './utils.js';

export interface ModMeta {
    name: types.ModName | undefined;
    packageId: types.ModPackageId | undefined;
}

export function extractModMetadata(xml: string): ModMeta {
    const dom = new jsdom.JSDOM(xml, { contentType: 'text/xml' });
    const root = dom.window.document.documentElement;
    const name = utils.dom
        .getDirectChildByTagName(root, types.ElemTagName.name)
        ?.textContent?.trim();
    const packageId = utils.dom
        .getDirectChildByTagName(root, types.ElemTagName.packageId)
        ?.textContent?.trim();

    return {
        name: name as types.BaseToOpaque<typeof name, types.ModName>,
        packageId: packageId as types.BaseToOpaque<typeof packageId, types.ModPackageId>,
    };
}
