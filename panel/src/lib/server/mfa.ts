import otplib from 'otplib';
const { authenticator } = otplib;

export const generateMfaSecret = () => {
    return authenticator.generateSecret();
};

export const verifyMfaToken = (token: string, secret: string) => {
    return authenticator.check(token, secret);
};

export const generateOtpAuthUrl = (username: string, secret: string) => {
    return authenticator.keyuri(username, 'PetalPort', secret);
};
