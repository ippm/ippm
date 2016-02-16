import * as fs from 'fs';
import * as path from 'path';

export function findDirWithFile(startDir, filename) {
	let dir = startDir;
	for (;;) {
		try {
			fs.accessSync(`${dir}/${filename}`, fs.R_OK);
		} catch (e) {
			if (!(code in e) || e.code !== 'ENOENT') {
				throw e;
			}

			const prevDir = dir;
			dir = path.dirname(dir);
			if (dir === prevDir) {
				return null;
			}

			continue;
		}

		return dir;
	}
}
