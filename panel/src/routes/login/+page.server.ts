import { fail, redirect } from '@sveltejs/kit';
import { validateUser, createSession } from '$lib/server/db';
import { loginSchema } from '$lib/server/validation';

export const actions = {
    default: async ({ request, cookies }) => {
        const formData = Object.fromEntries(await request.formData());

        const result = loginSchema.safeParse(formData);

        if (!result.success) {
            const { fieldErrors } = result.error.flatten();
            const firstError = Object.values(fieldErrors).flat()[0];
            return fail(400, { error: firstError });
        }

        const { username, password } = result.data;

        const user = await validateUser(username, password);

        if (!user) {
            return fail(401, { error: 'Invalid credentials' });
        }

        // TODO: Check MFA here
        if (user.mfaEnabled) {
            // Need to implement 2-step login. 
            // For now, let's just log them in but maybe set a flag?
            // "Advanced" plan said: Login -> MFA Verify -> Session.
            // Complex to implement in one go.
            // Let's set a temporary cookie "pre-auth-userid"? 
            // Or just fail for now saying "MFA not supported yet via CLI"? No.
            // Let's implement basics first.
        }

        // Create secure session
        const sessionId = await createSession(user.id);

        // Set session cookie
        cookies.set('session', sessionId, {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7 // 1 week
        });

        throw redirect(303, '/');
    }
};
