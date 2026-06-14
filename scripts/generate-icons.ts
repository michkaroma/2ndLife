// scripts/generate-icons.ts — génère les icônes PWA depuis assets/logo-source.svg.
// Lancer : npm run icons
import sharp from 'sharp';
import { mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join('assets', 'logo-source.svg');
const OUT = join('static', 'icons');
mkdirSync(OUT, { recursive: true });
mkdirSync('static', { recursive: true });

const BG = '#0d0f14';
const svg = readFileSync(SRC);

async function plain(size: number, file: string): Promise<void> {
	await sharp(svg, { density: 384 })
		.resize(size, size, { fit: 'contain', background: BG })
		.png()
		.toFile(join(OUT, file));
	console.log('  ✓', file);
}

// Maskable : logo à 80 % + marge (zone de sécurité) sur fond plein.
async function maskable(size: number, file: string): Promise<void> {
	const inner = Math.round(size * 0.8);
	const pad = Math.round((size - inner) / 2);
	const logo = await sharp(svg, { density: 384 })
		.resize(inner, inner, { fit: 'contain', background: BG })
		.png()
		.toBuffer();
	await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
		.composite([{ input: logo, top: pad, left: pad }])
		.png()
		.toFile(join(OUT, file));
	console.log('  ✓', file);
}

async function main(): Promise<void> {
	console.log('Génération des icônes PWA depuis', SRC);
	await plain(192, 'icon-192.png');
	await plain(512, 'icon-512.png');
	await plain(180, 'apple-touch-icon.png');
	await plain(72, 'badge-72.png');
	await maskable(192, 'maskable-192.png');
	await maskable(512, 'maskable-512.png');
	await sharp(svg, { density: 384 })
		.resize(32, 32, { fit: 'contain', background: BG })
		.png()
		.toFile(join('static', 'favicon.png'));
	console.log('  ✓ favicon.png');
	// Safari mask-icon : on réutilise la source SVG telle quelle (acceptable en perso).
	copyFileSync(SRC, join(OUT, 'safari-pinned-tab.svg'));
	console.log('  ✓ safari-pinned-tab.svg');
	console.log('Terminé.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
