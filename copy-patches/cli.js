import fs from 'node:fs/promises';
import path from 'node:path';
import * as commander from 'commander';

async function main() {
    const program = commander.program
        .argument('<string>', 'Source')
        .argument('<string>', 'Destination')
        .option('-s [string]', 'Directories to skip divided by ","')
        .action(async (source, destination, { s }) => {
            s = s.split(',');

            const srcDirContent = (await fs.readdir(source)).filter(item => !s.includes(item));

            for (const dirName of srcDirContent) {
                const src = path.join(source, dirName);
                const dest = path.join(destination, dirName, 'Patches', dirName);

                await fs.cp(src, dest, { recursive: true });
            }

            console.log('Done!');
        });

    await program.parseAsync();
}

await main();