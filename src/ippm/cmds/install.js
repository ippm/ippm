import {add as pakAdd} from '../../libs/package';
import {
	findIppmFile,
	readLockFile,
	writeLocktFile,
} from '../../libs/utils';

async function add(pakRaw, lock) {
	/* eslint-disable array-callback-return, no-param-reassign */
	const {ipfs, meta} = await pakAdd(pakRaw);
	const dependencies = meta.dependencies || {};
	const nameVer = `${meta.name}@${meta.version}`;
	const pak = {
		main: meta.main || 'index.js',
		ipfs,
		dependencies: {},
	};
	lock.packages[nameVer] = pak;
	for (const depName of Object.keys(dependencies)) {
		const depMeta = await add(`${depName}@${dependencies[depName]}`, lock);
		pak.dependencies[depMeta.name] = depMeta.version;
	}
	return meta;
	/* eslint-enable */
}

export default async function install(args) {
	const projectPath = await findIppmFile(process.cwd());
	const lock = await readLockFile(projectPath);
	for (const pak of args.packages) {
		const depMeta = await add(pak, lock);
		lock.packages[''].dependencies[depMeta.name] = depMeta.version;
	}
	await writeLocktFile(projectPath, lock);
}
