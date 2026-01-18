
import { fail, redirect } from '@sveltejs/kit';
import { getUsers, getSettings, createUser } from '$lib/server/db';

export const load = async ({ locals }) => {
    // If authenticated, redirect home
    if (locals.user) throw redirect(303, '/');

    const users = await getUsers();
    const settings = await getSettings();

    // Allow if no users exist (First Run) OR if signups are not locked
    const allowed = users.length === 0 || !settings.signupLocked;

    if (!allowed) {
        throw redirect(303, '/login');
    }

    return {
        isFirstUser: users.length === 0
    };
};

export const actions = {
    default: async ({ request, cookies }) => {
        const data = await request.formData();
        const username = data.get('username') as string;
        const password = data.get('password') as string;
        const confirmPassword = data.get('confirmPassword') as string;

        if (!username || !password || !confirmPassword) {
            return fail(400, { error: 'All fields are required' });
        }

        if (password !== confirmPassword) {
            return fail(400, { error: 'Passwords do not match' });
        }

        if (password.length < 8) {
            return fail(400, { error: 'Password must be at least 8 characters long' });
        }

        try {
            const users = await getUsers();
            const settings = await getSettings();

            // Re-check permission (race condition possible but low risk for this app)
            if (users.length > 0 && settings.signupLocked) {
                return fail(403, { error: 'Registration is currently disabled.' });
            }

            const user = await createUser(username, password);

            // Create secure session
            const sessionId = await createSession(user.id);

            // Log them in immediately
            cookies.set('session', sessionId, {
                path: '/',
                httpOnly: true,
                sameSite: 'strict',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24 * 7 // 1 week
            });

            throw redirect(303, '/');
        } catch (e: any) {
            if (e.message.includes('redirect')) throw e; // Pass redirects through
            return fail(500, { error: e.message || 'Registration failed' });
        }
    }
};
