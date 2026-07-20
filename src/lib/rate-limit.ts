const windowMs = 60_000; // 1 minute
const maxRequests = 10;  // 10 requests per minute per IP

const requestCounts = new Map<string, number[]>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = requestCounts.get(ip) || [];
  
  // Filter out timestamps outside the window
  const recentTimestamps = timestamps.filter(ts => now - ts < windowMs);
  
  if (recentTimestamps.length >= maxRequests) {
    // Rate limited
    requestCounts.set(ip, recentTimestamps);
    return false;
  }
  
  // Add current request
  recentTimestamps.push(now);
  requestCounts.set(ip, recentTimestamps);
  
  return true;
}
