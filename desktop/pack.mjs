// Builds Academic Weapon.app: copies the website build into web/ and packages it with Electron.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('Run "npm run build" in app/ first.');
rmSync(join(here, 'web'), { recursive: true, force: true });
cpSync(dist, join(here, 'web'), { recursive: true, force: true });
const paths = await packager({
  dir: here,
  out: join(here, 'out'),
  overwrite: true,
  name: 'Academic Weapon',
  appBundleId: 'local.academicweapon.tracker',
  appCategoryType: 'public.app-category.education',
  icon: join(here, 'icon.icns'),
  ignore: [/^\/out($|\/)/, /^\/pack\.mjs$/, /^\/icon\.iconset($|\/)/],
  prune: true,
});
// Put a copy where it is easy to find: app/Academic Weapon.app (ditto keeps the bundle's links intact).
const finalApp = join(here, '..', 'Academic Weapon.app');
rmSync(finalApp, { recursive: true, force: true });
execFileSync('ditto', [join(paths[0], 'Academic Weapon.app'), finalApp]);
// The packager's own output is only a staging copy: drop it to save ~250 MB.
rmSync(join(here, 'out'), { recursive: true, force: true });
console.log('Desktop app ready:', finalApp);
