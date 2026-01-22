/**
 * Mock Email Service
 * Logs emails to the console instead of sending them.
 */
class EmailService {
    async sendCredentials(email, role, password) {
        console.log('==================================================');
        console.log(`[EMAIL SIMULATION] Sending credentials to ${email}`);
        console.log(`Role: ${role}`);
        console.log(`Password: ${password}`);
        console.log('==================================================');
        return true;
    }
}

export default new EmailService();
