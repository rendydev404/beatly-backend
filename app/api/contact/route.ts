import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, email, message } = body;

        // Validate input
        if (!name || !email || !message) {
            return NextResponse.json(
                { error: 'All fields are required' },
                { status: 400 }
            );
        }

        // Create transporter using Gmail SMTP
        // Note: For Gmail, you need to use App Password if 2FA is enabled
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_EMAIL,
                pass: process.env.SMTP_PASSWORD,
            },
        });

        // Email content
        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: 'rendyakun50@gmail.com',
            subject: `[Beatly Contact] Pesan dari ${name}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 20px; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">📧 Pesan Baru dari Beatly</h1>
                    </div>
                    <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
                        <div style="margin-bottom: 20px;">
                            <p style="color: #6b7280; margin: 0 0 5px 0; font-size: 14px;">Nama:</p>
                            <p style="color: #111827; margin: 0; font-size: 16px; font-weight: 600;">${name}</p>
                        </div>
                        <div style="margin-bottom: 20px;">
                            <p style="color: #6b7280; margin: 0 0 5px 0; font-size: 14px;">Email:</p>
                            <p style="color: #111827; margin: 0; font-size: 16px;">
                                <a href="mailto:${email}" style="color: #6366f1;">${email}</a>
                            </p>
                        </div>
                        <div style="margin-bottom: 20px;">
                            <p style="color: #6b7280; margin: 0 0 5px 0; font-size: 14px;">Pesan:</p>
                            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
                                <p style="color: #374151; margin: 0; white-space: pre-wrap;">${message}</p>
                            </div>
                        </div>
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                            Email ini dikirim melalui formulir kontak Beatly.
                        </p>
                    </div>
                </div>
            `,
            replyTo: email,
        };

        // Send email
        await transporter.sendMail(mailOptions);

        return NextResponse.json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        return NextResponse.json(
            { error: 'Failed to send email' },
            { status: 500 }
        );
    }
}
