//This file provides a simple email service utility

const nodemailer = require("nodemailer"); //imports nodemailes which is a popular Node.js  package for sending emails via SMTP or other transport mechanisms.

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function sendEmail({ to, subject, text }) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
  });
}

module.exports = { sendEmail };
