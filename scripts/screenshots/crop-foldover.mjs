// Frame the app window from Foldover's synthetic UI-tour capture. Pixels inside
// the window are copied unchanged; runner menu bar, desktop and Dock are omitted.
import sharp from 'sharp';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node crop-foldover.mjs source.png destination.png');
await sharp(source).extract({ left: 12, top: 48, width: 1000, height: 640 }).png().toFile(destination);
