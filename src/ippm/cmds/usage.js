const USAGE = `
usage: ippm <command>

<command>:
	- i, install: make package importable
	- ls, list  : list installed packages
	- up, update: update packages
`.replace(/\t/g, '  ');


export default function usage() {
	console.log(USAGE);
}
