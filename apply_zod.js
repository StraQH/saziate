const fs = require('fs');
const path = require('path');

const routes = [
  { file: 'src/app/api/v1/auth/login/route.ts', schema: 'loginSchema' },
  { file: 'src/app/api/v1/auth/signup/route.ts', schema: 'signupSchema' },
  { file: 'src/app/api/v1/auth/onboard/route.ts', schema: 'signupSchema' }, // similar shape
  { file: 'src/app/api/v1/residents/route.ts', schema: 'createResidentSchema' },
  { file: 'src/app/api/v1/residents/import/route.ts', schema: 'importResidentsSchema' },
  { file: 'src/app/api/v1/resident/profile/route.ts', schema: 'updateProfileSchema' },
  { file: 'src/app/api/v1/collections/log/route.ts', schema: 'collectionLogSchema' },
  { file: 'src/app/api/v1/collections/verify/route.ts', schema: 'collectionVerifySchema' },
  { file: 'src/app/api/v1/payments/log-cash/route.ts', schema: 'logCashSchema' },
  { file: 'src/app/api/v1/billing/cancel/route.ts', schema: 'cancelInvoiceSchema' },
  { file: 'src/app/api/v1/billing/reconcile/route.ts', schema: 'reconcileInvoiceSchema' },
  { file: 'src/app/api/v1/billing/generate/route.ts', schema: 'generateBillingSchema' },
  { file: 'src/app/api/v1/psp/settings/route.ts', schema: 'pspSettingsSchema' },
  { file: 'src/app/api/v1/admin/psps/route.ts', schema: 'registerPspSchema' },
  { file: 'src/app/api/v1/admin/psps/approve/route.ts', schema: 'approvePspSchema' },
  { file: 'src/app/api/v1/routes/route.ts', schema: 'createRouteSchema' },
];

routes.forEach(({ file, schema }) => {
  if (!fs.existsSync(file)) {
    console.log(`Skipping ${file}, does not exist`);
    return;
  }
  let content = fs.readFileSync(file, 'utf8');

  // Skip if already has import
  if (content.includes(`import { ${schema} }`)) {
    return;
  }

  // Calculate relative path to src/lib/validators
  const dirPath = path.dirname(file);
  const depth = dirPath.split(path.sep).length - 1; // Number of directories from root
  // Actually we can just use '@/lib/validators' since Next.js supports path aliases
  
  const importStatement = `import { ${schema} } from "@/lib/validators";\n`;
  content = importStatement + content;

  // Find req.json() block
  const jsonRegex = /const (?:body|\{[^\}]+\})\s*=\s*await req\.json\(\)\s*(?:as any)?;/g;
  
  // Custom replacements depending on the route
  content = content.replace(jsonRegex, (match) => {
    return `const rawBody = await req.json();
    const parsed = ${schema}.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const ${match.includes('const body') ? 'body' : match.match(/const (\{[^\}]+\})/)[1]} = parsed.data;`;
  });

  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file}`);
});
