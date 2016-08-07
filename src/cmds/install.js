import {add as pakAdd} from '../libs/package';
import {
	findIppmFile,
	readIppmFile,
	readLockFile,
	writeLockFile,
	gcLock,
} from '../libs/utils';

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
	let packages = args.packages;
	if (0 === args.packages.length) {
		const ippm = await readIppmFile(projectPath);
		packages = Object.keys(ippm.dependencies).map(dep => `${dep}@${ippm.dependencies[dep]}`);
	}
	for (const pak of packages) {
		const depMeta = await add(pak, lock);
		lock.packages[''].dependencies[depMeta.name] = depMeta.version;
	}
	await writeLockFile(projectPath, gcLock(lock));
}
