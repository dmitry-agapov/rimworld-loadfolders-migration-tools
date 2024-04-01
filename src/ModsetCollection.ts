import * as utils from './utils.js';
import * as types from './types.js';

export const ModSet = utils.set.JSONAbleSet<types.ModName>;
export type ModSet = utils.set.JSONAbleSet<types.ModName>;

export class ModSetCollection {
    #sets: ModSet[] = [];
    add(value: ModSet) {
        if (!this.#sets.find((item) => utils.set.isEqSets(item, value))) {
            this.#sets.push(value);
        }
    }
    forEach(cb: (v: ModSet) => void) {
        this.#sets.forEach(cb);
    }
    mergeWith(set: ModSetCollection) {
        set.forEach((item) => this.add(item));
    }
    toArrayDeep() {
        return this.#sets.map((item) => [...item]);
    }
    isEqualTo(set: ModSetCollection) {
        return this.size === set.size && this.#sets.every((item) => set.has(item));
    }
    has(value: Set<string>) {
        return !!this.#sets.find((item) => utils.set.isEqSets(item, value));
    }
    get size() {
        return this.#sets.length;
    }
    get names(): types.ModName[] {
        return [...new Set(this.toArrayDeep().flat())];
    }
    toJSON() {
        return this.#sets;
    }
}
