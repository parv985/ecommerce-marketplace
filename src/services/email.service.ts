import nodemailer from "nodemailer";

let transporterPromise:
  | ReturnType<typeof createTestTransporter>
  | undefined;

async function createTestTransporter() {
  console.log("[EMAIL] Creating Ethereal test account...");
  const testAccount =
    await nodemailer.createTestAccount();
  console.log("[EMAIL] Ethereal account created:", testAccount.user);

  return nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}

export const sendPasswordResetEmail = async (
  email: string,
  resetUrl: string,
): Promise<void> => {
  console.log("[EMAIL] Sending password reset email to:", email);

  try {
    if (!transporterPromise) {
      transporterPromise = createTestTransporter();
    }

    const transporter = await transporterPromise;
    console.log("[EMAIL] Transporter ready");

    const info = await transporter.sendMail({
      from: '"E-Commerce Marketplace" <no-reply@example.com>',
      to: email,
      subject: "Password Reset",
      text: `Reset your password using this link:\n\n${resetUrl}\n\nThis link expires in 15 minutes.`,
    });

    console.log("[EMAIL] Message sent, Message ID:", info.messageId);

    const previewUrl =
      nodemailer.getTestMessageUrl(info);

    if (previewUrl) {
      console.log(
        "[EMAIL] Preview URL: " + previewUrl,
      );
    } else {
      console.log(
        "[EMAIL] WARNING: No preview URL available. This usually means the email was not sent via Ethereal or getTestMessageUrl returned null.",
      );
    }
  } catch (error) {
    console.error("[EMAIL] ERROR sending email:", error);
    throw error;
  }
};