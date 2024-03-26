import fs from 'node:fs/promises';
import * as types from './types.js';
import * as utils from './utils.js';

export class KnownMods {
    #value: Record<types.ModName, utils.JSONAbleSet<types.ModPackageId>> = {};
    constructor(value: Record<string, string[]>) {
        for (const [k, v] of Object.entries(value)) {
            const modName = k as types.BaseToOpaque<typeof k, types.ModName>;
            const packageIds = v as types.BaseToOpaque<typeof v, types.ModPackageId[]>;

            this.#value[modName] = new utils.JSONAbleSet(packageIds);
        }
    }
    add(name: types.ModName, packageId: types.ModPackageId) {
        if (this.#value[name]) {
            this.#value[name]?.add(packageId);
        } else {
            this.#value[name] = new utils.JSONAbleSet([packageId]);
        }
    }
    get(name: types.ModName): types.ModPackageId[] | undefined {
        const value = this.#value[name];

        return value ? [...value] : undefined;
    }
    getNames() {
        return Object.keys(this.#value);
    }
    toJSON() {
        return this.#value;
    }
    static async fromFile(path: string) {
        return new KnownMods(JSON.parse(await fs.readFile(path, 'utf-8')));
    }
}
