import {qwm} from 'js-utils';
import install from './cmds/install';
import list from './cmds/list';
import update from './cmds/update';
import usage from './cmds/usage';

export {default as install} from './cmds/install';
export {default as list} from './cmds/list';
export {default as update} from './cmds/update';
export {default as usage} from './cmds/usage';

export const ALIASES = qwm(`
	i install
	ls list
	up update
`);

export async function route(cmdIn, options) {
	const cmd = (cmdIn in ALIASES ? ALIASES[cmdIn] : cmdIn).toLowerCase();

	switch (cmd) {
		case 'install':
			await install(options);
			break;

		case 'update':
			await update(options);
			break;

		case 'list':
			await list(options);
			break;

		default:
			await usage(options);
	}
}
