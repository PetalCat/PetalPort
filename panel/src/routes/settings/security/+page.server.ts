
import { fail } from '@sveltejs/kit';
import { getSettings, updateSettings, updateUser, getUserById, type User } from '$lib/server/db';
import { generateMfaSecret, generateOtpAuthUrl, verifyMfaToken } from '$lib/server/mfa';
import QRCode from 'qrcode';

export const load = async ({ locals }) => {
    const settings = await getSettings();
    return {
        user: locals.user,
        settings
    };
};

export const actions = {
    updateSettings: async ({ request, locals }) => {
        if (locals.user.role !== 'admin') return fail(403, { error: 'Unauthorized' });

        const data = await request.formData();
        const signupLocked = data.has('signupLocked');

        await updateSettings({ signupLocked });

        return { success: 'Settings updated' };
    },

    setupMfa: async ({ locals }) => {
        const secret = generateMfaSecret();
        const otpauth = generateOtpAuthUrl(locals.user.username, secret);

        const qrCode = await QRCode.toDataURL(otpauth);

        return { qrCode, secret };
    },

    verifyMfa: async ({ request, locals }) => {
        const data = await request.formData();
        const token = data.get('token') as string;
        const secret = data.get('secret') as string;

        if (!verifyMfaToken(token, secret)) {
            const otpauth = generateOtpAuthUrl(locals.user.username, secret);
            const qrCode = await QRCode.toDataURL(otpauth);
            return fail(400, { error: 'Invalid verification code', qrCode, secret });
        }

        await updateUser(locals.user.id, { mfaEnabled: true, mfaSecret: secret });

        return { success: 'Two-Factor Authentication enabled!' };
    },

    disableMfa: async ({ locals }) => {
        await updateUser(locals.user.id, { mfaEnabled: false, mfaSecret: undefined });
        return { success: 'MFA Disabled' };
    }
};
