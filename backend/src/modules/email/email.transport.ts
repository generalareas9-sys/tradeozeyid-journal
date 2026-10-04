/**
 * Email delivery (docs/phase-plan.md, Phase 3).
 *
 * "Email delivery: console transport in development behind an interface, so
 * Phase 16 can swap in a real provider without touching call sites."
 *
 * The console transport prints the message to the log. It never prints a
 * password; the password-reset email contains the single-use token link, which is
 * the only secret it carries and is necessary for the flow to be testable
 * locally.
 */

export interface PasswordResetEmail {
  to: string;
  displayName: string;
  /** The single-use reset token, sent as part of the link. */
  token: string;
  expiresAt: Date;
}

export interface EmailTransport {
  sendPasswordReset(message: PasswordResetEmail): Promise<void>;
}

class ConsoleEmailTransport implements EmailTransport {
  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    // Imported here rather than at module scope so this file stays free of a
    // logger import cycle in tests that never send mail.
    const { getLogger } = await import('../../lib/logger.js');

    getLogger().info(
      {
        to: message.to,
        subject: 'Reset your TradeOzeyid password',
        resetUrl: `/reset-password?token=${message.token}`,
        expiresAt: message.expiresAt.toISOString(),
      },
      'Console email transport: password reset',
    );
  }
}

let transport: EmailTransport = new ConsoleEmailTransport();

export function getEmailTransport(): EmailTransport {
  return transport;
}

/** Swaps the transport. Phase 16 wires a real provider here. */
export function setEmailTransport(next: EmailTransport): void {
  transport = next;
}