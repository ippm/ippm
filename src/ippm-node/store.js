import startsWith from 'core-js/library/fn/string/virtual/starts-with';
import find from 'core-js/library/fn/array/virtual/find';
import * as path from 'path';


export default class Store {
	constructor(rootPak) {
		this._packagesByName = Object.create(null);
		this._packages = [];

		// eslint-disable-next-line no-param-reassign
		rootPak.name = '';
		this.add(rootPak);
	}

	add(pak) {
		/* eslint-disable no-param-reassign */
		pak.path = path.normalize(pak.path);
		pak.searchPath = `${pak.path}/`;
		/* eslint-enable no-param-reassign */

		this._packages.push(pak);
		this._packagesByName[pak.name] = pak;

		return this;
	}

	getByFilePath(filePath) {
		const filePathNorm = path.normalize(filePath);

		if (filePathNorm.indexOf('/node_modules/') !== -1) return undefined;

		return this._packages::find(pak => filePathNorm::startsWith(pak.searchPath));
	}

	getByName(pakName) {
		return this._packagesByName[pakName];
	}

	getRoot() {
		return this._packagesByName[''];
	}
}
