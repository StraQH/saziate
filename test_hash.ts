
import { hashPassword, verifyPassword } from './src/lib/hash';

async function main() {
  console.log('Starting hash...');
  const t0 = Date.now();
  const hash = await hashPassword('TestPassword123!');
  console.log('Hash:', hash, 'took', Date.now() - t0, 'ms');
  
  const valid = await verifyPassword('TestPassword123!', hash);
  console.log('Valid:', valid);
}
main().catch(console.error);
