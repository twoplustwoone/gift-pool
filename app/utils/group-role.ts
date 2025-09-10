import { z } from 'zod';

export const GROUP_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;

export const GroupRoleSchema = z.enum(GROUP_ROLES);

export type GroupRole = z.infer<typeof GroupRoleSchema>;
