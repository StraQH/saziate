
import { betterAuth } from 'better-auth';
const a = betterAuth({
  database: {} as any,
  emailAndPassword: {
    enabled: true,
    hashPassword: async (password: string) => password,
    verifyPassword: async ({ password, hash }: any) => password === hash
  }
});
