const fs = require("node:fs");
const path = require("node:path");

// Monkeypatch copyfile operations to automatically retry on EBUSY/EPERM lockouts on Windows
const originalCopyFileSync = fs.copyFileSync;
fs.copyFileSync = function (src: string, dest: string, flags?: number) {
  let attempts = 0;
  while (true) {
    try {
      return originalCopyFileSync(src, dest, flags);
    } catch (error) {
      const err = error as any;
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
fs.promises.copyFile = async function (src: string, dest: string, flags?: number) {
  let attempts = 0;
  while (true) {
    try {
      return await originalCopyFilePromise(src, dest, flags);
    } catch (error) {
      const err = error as any;
      attempts++;
      if ((err.code === "EBUSY" || err.code === "EPERM") && attempts < 15) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw err;
    }
  }
};

// Monkeypatch symlinkSync to copy directory instead on Windows to prevent EPERM
const originalSymlinkSync = fs.symlinkSync;
fs.symlinkSync = function (target: string, p: string, type?: string) {
  try {
    return originalSymlinkSync(target, p, type);
  } catch (error) {
    const err = error as any;
    if (err.code === "EPERM") {
      // Fallback to full directory copy
      const cpSync = fs.cpSync;
      if (cpSync) {
        cpSync(target, p, { recursive: true });
        return;
      }
    }
    throw err;
  }
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-auth", "drizzle-orm", "drizzle-kit"],
};

module.exports = nextConfig;