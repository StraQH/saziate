import type { NextConfig } from "next";
import fs from "node:fs";

// Monkeypatch copyfile operations to automatically retry on EBUSY/EPERM lockouts on Windows
const originalCopyFileSync = fs.copyFileSync;
fs.copyFileSync = function (src, dest, flags) {
  let attempts = 0;
  while (true) {
    try {
      return originalCopyFileSync(src, dest, flags);
    } catch (err: any) {
      attempts++;
      if ((err.code === "EBUSY" || err.code === "EPERM") && attempts < 15) {
        const limit = Date.now() + 100;
        while (Date.now() < limit) {}
        continue;
      }
      throw err;
    }
  }
};

const originalCopyFilePromise = fs.promises.copyFile;
fs.promises.copyFile = async function (src, dest, flags) {
  let attempts = 0;
  while (true) {
    try {
      return await originalCopyFilePromise(src, dest, flags);
    } catch (err: any) {
      attempts++;
      if ((err.code === "EBUSY" || err.code === "EPERM") && attempts < 15) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw err;
    }
  }
};

const nextConfig: NextConfig = {
  serverExternalPackages: ["drizzle-kit"],
};

export default nextConfig;