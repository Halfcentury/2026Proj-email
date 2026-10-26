const response = {
  data: {
    integrations: [] as {
      id: string;
      name: string;
      provider: string;
      connection?: {
        isActive: boolean;
        tools?: { name: string; isEnabled: boolean }[];
      };
      tools: { name: string }[];
    }[],
  },
  isLoading: false,
  error: undefined,
};
export function useIntegrations() {
  return response;
}
