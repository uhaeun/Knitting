import { useMutation } from '@tanstack/react-query';

import { createProfile, signIn, signUp, updateProfile } from '@/features/auth/api';
import { useAuth } from '@/features/auth/store';

export function useSignIn() {
  return useMutation({ mutationFn: (v: { email: string; password: string }) => signIn(v.email, v.password) });
}

export function useSignUp() {
  return useMutation({ mutationFn: (v: { email: string; password: string }) => signUp(v.email, v.password) });
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
