// Usage: npm run hash-passphrase   → asks for the passphrase without showing it, prints WS_PASSPHRASE_HASH=...
// It also reads the passphrase from a pipe. It takes no argument, so the passphrase stays out of shell history.
import { hash } from '@node-rs/argon2';

function readHidden() {
	return new Promise((resolve) => {
		const stdin = process.stdin;
		let value = '';
		const done = () => {
			stdin.setRawMode(false);
			stdin.pause();
			stdin.off('data', onData);
			process.stderr.write('\n');
			resolve(value);
		};
		const onData = (chunk) => {
			for (const ch of chunk) {
				if (ch === '\r' || ch === '\n' || ch === '\u0004') return done();
				if (ch === '\u0003') {
					stdin.setRawMode(false);
					process.stderr.write('\n');
					process.exit(130);
				}
				if (ch === '\u007f' || ch === '\b') value = [...value].slice(0, -1).join('');
				else value += ch;
			}
		};
		process.stderr.write('Passphrase: ');
		stdin.setEncoding('utf8');
		stdin.setRawMode(true);
		stdin.resume();
		stdin.on('data', onData);
	});
}

async function readPiped() {
	let value = '';
	process.stdin.setEncoding('utf8');
	for await (const chunk of process.stdin) value += chunk;
	return value.replace(/\r?\n$/, '');
}

if (process.argv.length > 2) {
	console.error('usage: npm run hash-passphrase (it asks for the passphrase, or reads it from a pipe)');
	process.exit(1);
}
const passphrase = process.stdin.isTTY ? await readHidden() : await readPiped();
if (!passphrase) {
	console.error('The passphrase is empty.');
	process.exit(1);
}
console.log('WS_PASSPHRASE_HASH=' + (await hash(passphrase)));
