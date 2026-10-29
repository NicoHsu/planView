const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

async function main() {
  const root = path.resolve(__dirname, "..");
  const source = path.join(root, "apps/mobile/assets/icon.svg");
  await fs.mkdir(path.join(root, "assets"), { recursive: true });
  await sharp(source).flatten({ background: "#0f5f55" }).resize(1024, 1024).png()
    .toFile(path.join(root, "assets/icon.png"));
  await fs.copyFile(path.join(root, "assets/icon.png"), path.join(root, "apps/mobile/assets/icon.png"));
  // ICO supports PNG image data. Zero dimensions in the directory mean 256px.
  const png = await sharp(source).flatten({ background: "#0f5f55" }).resize(256, 256).png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await fs.writeFile(path.join(root, "assets/icon.ico"), Buffer.concat([header, png]));
  console.log("Generated opaque iOS icon and desktop PNG/ICO from the shared SVG.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
