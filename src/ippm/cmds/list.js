import {
	findManifestFile,
	readManifestFile,
	objectValues,
	objectIter,
} from '../../libs/utils';
import {fgGreen, fgBlue, reset} from '../../libs/colors';

/* eslint-disable no-console */

export default function list() {
	const projectPath = findManifestFile(process.cwd());
	const manifest = readManifestFile(projectPath);

	manifest.packages::objectValues()
		.sort((a, b) => {
			if (a.name < b.name) return -1;
			else if (b.name < a.name) return 1;
			return 0;
		})
		.forEach(pak => {
			const deps = pak.dependencies::objectIter();

			const pakPrefix = `${deps.length ? '┬' : '─'}`;
			console.log(`${pakPrefix} ${fgGreen}${pak.name || 'root project'}${reset} ${pak.ipfs || ''}`);

			deps.forEach(([depName, depVer], depI) => {
				const depPrefix = `${depI + 1 === deps.length ? '└' : '├'}─`;
				console.log(`${depPrefix} ${fgBlue}${depName}@${depVer}${reset}`);
			});

			console.log();
		});
}
