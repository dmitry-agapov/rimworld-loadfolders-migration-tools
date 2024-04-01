import * as fsUtils from './fs.js';

export function toXMLFile(str: string) {
    return fsUtils.normalizeEOL(xmlDocDecl + '\n' + str);
}

export const xmlDocDecl = '<?xml version="1.0" encoding="utf-8"?>';
