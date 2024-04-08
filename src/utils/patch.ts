export const enum PatchOpType {
    FindMod = 'PatchOperationFindMod',
    Sequence = 'PatchOperationSequence',
    Add = 'PatchOperationAdd',
    Test = 'PatchOperationTest',
}

export const enum ElemTagName {
    Patch = 'Patch',
    Defs = 'Defs',
    Operation = 'Operation',
    operations = 'operations',
    li = 'li',
    match = 'match',
    nomatch = 'nomatch',
    mods = 'mods',
    name = 'name',
    packageId = 'packageId',
    xpath = 'xpath',
    value = 'value',
}

export function isPatchOpOfType(elem: Element, type: PatchOpType) {
    return elem.getAttribute('Class') === type;
}
