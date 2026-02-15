const fs = require('fs');
const https = require('https');
const path = require('path');

const file = fs.createWriteStream(path.join(__dirname, 'public', 'og-image.png'));
console.log('Downloading reliable placeholder image...');

// Using a high-quality placeholder service to generate a PNG
// Blue background (#1A73E8) with White text
const url = "https://placehold.co/1200x630/1A73E8/FFFFFF/png?text=Paynet+Secure%0AVerification&font=roboto";

https.get(url, function (response) {
    if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', function () {
            file.close(() => console.log('✅ og-image.png downloaded successfully'));
        });
    } else {
        console.error(`❌ Download failed with status code: ${response.statusCode}`);
        file.close();
        fs.unlink(path.join(__dirname, 'public', 'og-image.png'), () => { }); // Delete empty file
    }
}).on('error', function (err) {
    fs.unlink(path.join(__dirname, 'public', 'og-image.png'), () => { }); // Delete empty file
    console.error('❌ Error downloading image:', err.message);
});
