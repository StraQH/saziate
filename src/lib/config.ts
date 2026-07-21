// Configuration variables wrapper governing environmental configurations

export const config = {
  get isMockMode(): boolean {
    if (typeof window !== "undefined") {
      return (
        window.location.hostname.includes("demo.") ||
        process.env.NEXT_PUBLIC_MOCK_MODE === "true"
      );
    }
    return process.env.NEXT_PUBLIC_MOCK_MODE === "true";
  },
};

