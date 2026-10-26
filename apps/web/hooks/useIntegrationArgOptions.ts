const response = {
  data: undefined as
    | { options: { value: string; label: string }[] }
    | undefined,
  isLoading: false,
  error: undefined,
};
export function useIntegrationArgOptions(..._args: unknown[]) {
  return response;
}
