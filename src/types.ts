export const enum NodeFilter {
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

declare const brand: unique symbol;

declare const base: unique symbol;

export type Opaque<Base, Brand = unknown> = Base & {
    readonly [brand]: Brand;
    readonly [base]: Base;
};

export type BaseToOpaque<Type, OpaqueType extends Opaque<unknown> | Opaque<unknown>[]> =
    OpaqueType extends Opaque<unknown>
        ? Exclude<Type, GetBase<OpaqueType>> | OpaqueType
        : Exclude<Type, GetBase<OpaqueType>[]> | OpaqueType;

type GetBase<T extends Opaque<unknown> | Opaque<unknown>[]> =
    T extends Opaque<unknown>
        ? T[typeof base]
        : T extends Opaque<unknown>[]
          ? T[number][typeof base]
          : never;

export type ModName = Opaque<string, 'ModName'>;

export type ModPackageId = Opaque<string, 'ModPackageId'>;

export const enum PatchOpType {
    FindMod = 'PatchOperationFindMod',
    Sequence = 'PatchOperationSequence',
}

export const enum ElemTagName {
    Patch = 'Patch',
    Operation = 'Operation',
    operations = 'operations',
    li = 'li',
    match = 'match',
    nomatch = 'nomatch',
    mods = 'mods',
    name = 'name',
    packageId = 'packageId',
}
