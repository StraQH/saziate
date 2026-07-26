import fs from 'fs';
import path from 'path';

const walkSync = function(dir, filelist) {
  const files = fs.readdirSync(dir);
  filelist = filelist || [];
  files.forEach(function(file) {
    if (fs.statSync(dir + '/' + file).isDirectory()) {
      filelist = walkSync(dir + '/' + file, filelist);
    }
    else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        filelist.push(path.join(dir, file));
      }
    }
  });
  return filelist;
};

const files = walkSync('./src/app/(dashboards)');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('alert(')) {
    // Replace alert("...") with toast("...", "error") if it's an error, else toast("...", "success") or "info"
    // Let's just use simple regex to replace alert(...) with toast(...)
    // For simplicity, toast("...", "error") if the string contains "error" or "failed" or "invalid"
    
    // Add import if not present
    if (!content.includes('useToast')) {
      content = content.replace(/(import .* from ".*";\r?\n)/, '$1import { useToast } from "@/components/ui/Toast";\n');
    }
    
    // Inject const { toast } = useToast(); right inside the main component
    // The main component is usually `export default function ...() {`
    if (!content.includes('const { toast } = useToast();')) {
      content = content.replace(/(export default function \w+\(.*\) {\r?\n)/, '$1  const { toast } = useToast();\n');
    }

    // Replace alert(...)
    content = content.replace(/alert\((.*)\)/g, (match, p1) => {
      const lower = p1.toLowerCase();
      if (lower.includes('error') || lower.includes('fail') || lower.includes('invalid') || lower.includes('must be')) {
        return `toast(${p1}, "error")`;
      }
      if (lower.includes('success') || lower.includes('verified')) {
        return `toast(${p1}, "success")`;
      }
      return `toast(${p1}, "info")`;
    });

    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
