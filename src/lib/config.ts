// Configuration variables wrapper governing environmental configurations

export const config = {
  isMockMode: process.env.NEXT_PUBLIC_MOCK_MODE === "true" || process.env.NEXT_PUBLIC_MOCK_MODE === undefined,
};
