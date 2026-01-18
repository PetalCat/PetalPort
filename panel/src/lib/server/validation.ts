import { z } from 'zod';

export const usernameSchema = z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username cannot exceed 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens');

export const passwordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long');

export const mfaTokenSchema = z.string()
    .length(6, 'MFA code must be exactly 6 digits')
    .regex(/^\d+$/, 'MFA code must be numeric');

export const registerSchema = z.object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: passwordSchema
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

export const loginSchema = z.object({
    username: z.string(), // Don't enforce strict rules on login to avoid enumeration timing? Actually strict is fine.
    password: z.string()
});

export const settingsSchema = z.object({
    signupLocked: z.boolean().optional(),
    mfaEnforced: z.boolean().optional()
});
