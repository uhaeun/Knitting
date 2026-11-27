// Existing command-line entry point for regenerating the brand assets.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

execFileSync(process.env.PYTHON || 'python3', [fileURLToPath(new URL('./render_icons.py', import.meta.url)), ...process.argv.slice(2)], { stdio: 'inherit' });
