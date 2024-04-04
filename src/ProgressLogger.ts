import process from 'node:process';

export function createProgressLogger(taskName: string, total: number) {
    let curr = 0;

    return (addon?: string) => {
        logProgress(taskName, ++curr, total, addon);
    };
}

export function logProgress(taskName: string, curr: number, total: number, addon?: string) {
    const pgBarWidth = 20;
    const pgBarCurrSectionsCount = curr / (total / pgBarWidth);
    const pgBar = '\u25A0'.repeat(pgBarCurrSectionsCount).padEnd(pgBarWidth, '-');
    const percentage = ~~(100 / (total / curr));
    const parts = [`\r${taskName} ${pgBar} ${percentage}%`, `${curr}/${total}`];
    if (addon) {
        parts.push(addon);
    }
    const output = parts
        .join(' | ')
        .slice(0, process.stdout.columns + 1)
        .padEnd(process.stdout.columns + 1);

    process.stdout.write(output);

    if (curr === total) {
        process.stdout.write('\n');
    }
}
