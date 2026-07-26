const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lint-results.json', 'utf16le'));
const anyErrors = [];
data.forEach(file => {
  if (file.messages) {
    file.messages.forEach(msg => {
      if (msg.ruleId === '@typescript-eslint/no-explicit-any') {
        anyErrors.push({
          file: file.filePath,
          line: msg.line,
          column: msg.column
        });
      }
    });
  }
});
fs.writeFileSync('any-errors.json', JSON.stringify(anyErrors, null, 2));
console.log(`Found ${anyErrors.length} any errors`);
