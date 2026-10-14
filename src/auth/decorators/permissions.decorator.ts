import { RolesGuard } from '../guards/roles-guard';

export const PermissionGuard = (permission: string) => {
  return new RolesGuard(permission);
};
