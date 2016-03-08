import {
	findManifestFile,
	readManifestFile,
	objectValueIter,
	objectIter,
} from '../../libs/utils';
import {fgGreen, fgBlue, reset} from '../../libs/colors';

/* eslint-disable no-console */

export default async function list() {
	const projectPath = await findManifestFile(process.cwd());
	const manifest = await readManifestFile(projectPath);

	[...manifest.packages::objectValueIter()]
		.sort((a, b) => {
			if (a.name < b.name) return -1;
			else if (b.name < a.name) return 1;
			return 0;
		})
		.forEach(pak => {
			const deps = [...pak.dependencies::objectIter()];

			const pakPrefix = `${deps.length ? '┬' : '─'}`;
			console.log(`${pakPrefix} ${fgGreen}${pak.name || 'root project'}${reset} ${pak.ipfs || ''}`);

			deps.forEach(([depName, depVer], depI) => {
				const depPrefix = `${depI + 1 === deps.length ? '└' : '├'}─`;
				console.log(`${depPrefix} ${fgBlue}${depName}@${depVer}${reset}`);
			});

			console.log();
		});
}
