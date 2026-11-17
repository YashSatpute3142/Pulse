import { useMutation } from '@tanstack/react-query';
import { usersApi } from '../../../api/endpoints/users.js';

export function useUpdateSettings() {
  return useMutation({ mutationFn: usersApi.updateSettings });
}
