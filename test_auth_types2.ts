
import { betterAuth } from 'better-auth';
const a = betterAuth({
  database: {} as any,
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password: string) => password,
      verify: async ({ password, hash }: any) => password === hash
    }
  }
});
