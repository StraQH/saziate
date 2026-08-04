const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const inputSvg = path.join(__dirname, 'public', 'logo.svg');
  
  if (!fs.existsSync(inputSvg)) {
    console.error('logo.svg not found!');
    return;
  }

  // 192x192
  await sharp(inputSvg)
    .resize(192, 192)
    .png()
    .toFile(path.join(__dirname, 'public', 'icon-192x192.png'));
    
  console.log('Generated icon-192x192.png');

  // 512x512
  await sharp(inputSvg)
    .resize(512, 512)
    .png()
    .toFile(path.join(__dirname, 'public', 'icon-512x512.png'));
    
  console.log('Generated icon-512x512.png');
}

generateIcons().catch(console.error);
