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

export const CMD_BY_NAME = {
	install,
	list,
	update,
};

export async function route(cmdIn, options) {
	const cmdLc = cmdIn.toLowerCase();
	const cmd = cmdLc in ALIASES ? ALIASES[cmdLc] : cmdLc;
	const cmdFunc = cmd in CMD_BY_NAME ? CMD_BY_NAME[cmd] : usage;
	await cmdFunc(options);
}
