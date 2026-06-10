const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const filesToConvert = [
    'คู่มือการใช้งาน_Admin_SuperAdmin.md',
    'คู่มือการใช้งาน_User.md',
    'คู่มือการนำขึ้นเซิร์ฟเวอร์สถาบันประสาทวิทยา.md'
];

const configPath = path.resolve(__dirname, 'config.json');

filesToConvert.forEach(file => {
    const mdPath = path.resolve(file);
    const pdfName = file.replace('.md', '.pdf');
    const pdfPath = path.resolve(pdfName);

    if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
    }

    console.log(`Converting ${file} to PDF using config.json...`);
    
    try {
        // Run md-to-pdf using config-file option which keeps arguments simple and robust
        const cmd = `npx md-to-pdf "${mdPath}" --config-file "${configPath}"`;
        const stdout = execSync(cmd, { encoding: 'utf8' });
        console.log('STDOUT:', stdout);
    } catch (e) {
        console.error('Execution Error:', e.message);
        if (e.stdout) console.log('STDOUT:', e.stdout);
        if (e.stderr) console.error('STDERR:', e.stderr);
    }

    if (fs.existsSync(pdfPath)) {
        console.log(`SUCCESS! Created ${pdfName}, size: ${fs.statSync(pdfPath).size} bytes`);
    } else {
        console.error(`FAILED to create ${pdfName}!`);
    }
});
