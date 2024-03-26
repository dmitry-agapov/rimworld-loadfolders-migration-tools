import * as utils from './utils.js';
import * as types from './types.js';

export const Modset = utils.JSONAbleSet<types.ModName>;
export type Modset = utils.JSONAbleSet<types.ModName>;

export class ModsetCollection {
    #sets: Modset[] = [];
    add(value: Modset) {
        if (!this.#sets.find((item) => utils.isEqSets(item, value))) this.#sets.push(value);
    }
    forEach(cb: (v: Modset) => void) {
        this.#sets.forEach(cb);
    }
    mergeWith(set: ModsetCollection) {
        set.forEach((item) => this.add(item));
    }
    toArrayDeep() {
        return this.#sets.map((item) => [...item]);
    }
    isEqualTo(set: ModsetCollection) {
        return this.size === set.size && this.#sets.every((item) => set.has(item));
    }
    has(value: Set<string>) {
        return !!this.#sets.find((item) => utils.isEqSets(item, value));
    }
    get size() {
        return this.#sets.length;
    }
    get names(): types.ModName[] {
        return utils.dedupeArray(this.toArrayDeep().flat());
    }
    toJSON() {
        return this.#sets;
    }
}
