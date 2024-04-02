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
