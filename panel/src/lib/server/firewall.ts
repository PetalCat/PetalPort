import { spawn } from 'node:child_process';

/**
 * Run a UFW command on the host directly (we are privileged + pid:host)
 */
async function runUfwCommand(args: string[]): Promise<string> {
    console.log(`[Firewall] Running on host: ufw ${args.join(' ')}`);

    // We are privileged and share PID namespace with host.
    // We can use nsenter to jump to PID 1's namespace (host init) and run the command.
    // To avoid shell injection, we pass arguments directly to nsenter -> sh -> ufw?
    // Actually, `sh -c` is still risky if we construct the string.
    // Ideally we'd use nsenter directly executing ufw, but we might need environment or path.
    // Let's try executing ufw directly via nsenter without `sh -c` if possible, or be very careful.

    // Safer approach: use nsenter to run ufw executable directly, passing args as array.
    // nsenter -t 1 -m -u -n -i -- /usr/sbin/ufw allow <port>/tcp

    const nsenterArgs = ['-t', '1', '-m', '-u', '-n', '-i', '--', '/usr/sbin/ufw', ...args];

    return new Promise((resolve, reject) => {
        const child = spawn('nsenter', nsenterArgs);

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data;
        });

        child.stderr.on('data', (data) => {
            stderr += data;
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`[Firewall] Command failed: ufw ${args.join(' ')}`, stderr);
                reject(new Error(`Firewall command failed: ${stderr || 'Unknown error'}`));
            } else {
                resolve(stdout);
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Allow a port through UFW
 */
export async function allowPort(port: number, comment?: string, protocol: 'tcp' | 'udp' | 'both' = 'tcp'): Promise<void> {
    const protocols = protocol === 'both' ? ['tcp', 'udp'] : [protocol];

    for (const proto of protocols) {
        const args = ['allow', `${port}/${proto}`];
        if (comment) {
            // UFW comment syntax: allow 80/tcp comment 'My Comment'
            args.push('comment', comment);
        }
        await runUfwCommand(args);
    }
}

/**
 * Deny/remove a port from UFW
 */
export async function denyPort(port: number, protocol: 'tcp' | 'udp' | 'both' = 'tcp'): Promise<void> {
    const protocols = protocol === 'both' ? ['tcp', 'udp'] : [protocol];

    for (const proto of protocols) {
        try {
            await runUfwCommand(['delete', 'allow', `${port}/${proto}`]);
        } catch (e) {
            // Rule might not exist, ignore
            console.log(`[Firewall] Rule ${port}/${proto} might not exist, skipping`);
        }
    }
}

/**
 * Sync firewall rules with current proxies
 */
export async function syncFirewallRules(ports: number[]): Promise<void> {
    for (const port of ports) {
        await allowPort(port, 'FRP Tunnel');
    }
}
