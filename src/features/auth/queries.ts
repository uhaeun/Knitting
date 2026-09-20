import { useMutation, useQuery } from '@tanstack/react-query';

import { changePassword, createProfile, deleteAccount, fetchEnabledSocials, requestPasswordReset, resendConfirmation, signIn, signInWithSocial, signUp, updatePassword, updateProfile, type SocialProvider } from '@/features/auth/api';
import { useAuth } from '@/features/auth/store';

export function useSignIn() {
  return useMutation({ mutationFn: (v: { email: string; password: string }) => signIn(v.email, v.password) });
}

export function useSignUp() {
  return useMutation({ mutationFn: (v: { email: string; password: string }) => signUp(v.email, v.password) });
}

export function useResendConfirmation() {
  return useMutation({ mutationFn: (email: string) => resendConfirmation(email) });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email: string) => requestPasswordReset(email) });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (v: { email: string; current: string; next: string }) => changePassword(v.email, v.current, v.next),
  });
}

export function useUpdatePassword() {
  const setRecovering = useAuth((s) => s.setRecovering);
  return useMutation({
    mutationFn: (password: string) => updatePassword(password),
    onSuccess: () => setRecovering(false),
  });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: (userId: string) => deleteAccount(userId) });
}

export function useEnabledSocials() {
  return useQuery({ queryKey: ['auth', 'socials'], queryFn: fetchEnabledSocials, staleTime: 5 * 60_000 });
}

export function useSocialSignIn() {
  return useMutation({ mutationFn: (provider: SocialProvider) => signInWithSocial(provider) });
}

export function useCreateProfile() {
  const setProfile = useAuth((s) => s.setProfile);
  return useMutation({
    mutationFn: createProfile,
    onSuccess: (p) => setProfile(p),
  });
}

export function useUpdateProfile() {
  const setProfile = useAuth((s) => s.setProfile);
  return useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof updateProfile>[1] }) => updateProfile(v.id, v.patch),
    onSuccess: (p) => setProfile(p),
  });
}
