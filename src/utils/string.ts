export function mapLines(str: string, cb: (line: string, index: number) => string) {
    return str.split('\n').map(cb).join('\n');
}

export function padBoth(str: string, targetLength: number, filler = ' ') {
    if (str.length >= targetLength) {
        return str;
    }

    const fillLength = (targetLength - str.length) / 2;
    const fillerStr = filler.repeat(fillLength);

    return fillerStr + str + fillerStr;
}
