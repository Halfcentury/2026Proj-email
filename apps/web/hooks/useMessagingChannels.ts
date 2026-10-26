import type {
  GetMessagingChannelsResponse,
  GetChannelTargetsResponse,
} from "@/utils/retired-notifications";
const response = {
  data: {
    channels: [],
    availableProviders: [],
  } as GetMessagingChannelsResponse,
  isLoading: false,
  error: undefined,
  mutate: async () => undefined,
};
export function useMessagingChannels(..._args: unknown[]) {
  return response;
}
export function useChannelTargets(..._args: unknown[]) {
  return {
    data: undefined as GetChannelTargetsResponse | undefined,
    isLoading: false,
    error: undefined,
  };
}
