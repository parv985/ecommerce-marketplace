import nodemailer from "nodemailer";

let transporterPromise:
  | ReturnType<typeof createTestTransporter>
  | undefined;

async function createTestTransporter() {
  console.log("[EMAIL] Creating Ethereal test account...");

  const testAccount =
    await nodemailer.createTestAccount();

  console.log("[EMAIL] Ethereal account created");
  console.log("[EMAIL] Test email:", testAccount.user);

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
  try {
    if (!transporterPromise) {
      transporterPromise = createTestTransporter();
    }

    const transporter = await transporterPromise;

    console.log("[EMAIL] Sending password reset email...");
    console.log("[EMAIL] Recipient:", email);

    const info = await transporter.sendMail({
      from: '"E-Commerce Marketplace" <no-reply@example.com>',
      to: email,
      subject: "Password Reset",
      text: [
        "You requested a password reset.",
        "",
        `Reset your password using this link: ${resetUrl}`,
        "",
        "This link expires in 15 minutes.",
      ].join("\n"),
    });

    console.log("[EMAIL] Message sent");
    console.log("[EMAIL] Message ID:", info.messageId);
    console.log("[EMAIL] Accepted:", info.accepted);

    const previewUrl =
      nodemailer.getTestMessageUrl(info);

    console.log("[EMAIL] Preview URL:", previewUrl);

    if (previewUrl) {
      console.log(
        `\n[EMAIL] Open this URL in your browser:\n${previewUrl}\n`,
      );
    }
  } catch (error) {
    console.error(
      "[EMAIL] Failed to send password reset email:",
      error,
    );

    throw error;
  }
};