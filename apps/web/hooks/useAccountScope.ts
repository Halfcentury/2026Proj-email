type Membership = {
  role: string;
  organizationId: string;
  isOwner: boolean;
  isAdmin: boolean;
  hasPendingInvitationToOrg: boolean;
  userName: string | null;
};
export function useOrganizationMembership(..._args: unknown[]) {
  return {
    data: undefined as Membership | undefined,
    isLoading: false,
    error: undefined,
    mutate: async () => undefined,
  };
}
export const useCurrentOrganization = () =>
  undefined as { id: string; name: string } | undefined;
