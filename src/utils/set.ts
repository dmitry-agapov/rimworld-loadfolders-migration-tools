export function isEqSets<T>(set1: Set<T>, set2: Set<T>) {
    return set1.size === set2.size && [...set1].every((item) => set2.has(item));
}

export class JSONAbleSet<T> extends Set<T> {
    toJSON() {
        return [...this];
    }
}
