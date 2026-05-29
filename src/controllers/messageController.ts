import { Request, Response } from "express";
import nodemailer from "nodemailer";
import { createNotification } from "../utils/notifications";
// import twilio from "twilio"; // Uncomment when SMS is configured

export const sendMessage = async (req: Request, res: Response) => {
  const { patientId, patientEmail, patientPhone, patientName, message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: "Message content is required",
    });
  }

  try {
    console.log(`[MESSAGE] Sending message to ${patientName} (${patientEmail}, ${patientPhone})`);
    console.log(`[MESSAGE] Content: ${message}`);

    // Email logic
    let emailSent = false;
    if (patientEmail) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp.ethereal.email",
          port: parseInt(process.env.SMTP_PORT || "587"),
          secure: process.env.SMTP_SECURE === "true",
          auth: {
            user: process.env.SMTP_USER || "placeholder@example.com",
            pass: process.env.SMTP_PASS || "password",
          },
        });

        await transporter.sendMail({
          from: `"Villahermosa Dental Clinic" <${process.env.SMTP_FROM || "no-reply@villahermosadental.com"}>`,
          to: patientEmail,
          subject: "Message from Villahermosa Dental Clinic",
          text: message,
          html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
        });
        emailSent = true;
        console.log(`[MESSAGE] Email sent to ${patientEmail}`);
      } catch (emailErr) {
        console.error("[MESSAGE] Email failed:", emailErr);
      }
    }

    // Add Portal Notification
    if (patientId) {
      createNotification(
        patientId,
        "New Message from Clinic",
        message.length > 100 ? message.substring(0, 97) + "..." : message,
        "message"
      );
    }

    // SMS logic (Twilio) - Not yet configured for Philippines
    // TODO: Configure SMS provider for PH numbers when ready
    const smsStatus = "Not configured";
    console.log(`[MESSAGE] SMS skipped - Not yet configured for Philippines`);

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to send email. Please check server configuration.",
      });
    }

    res.json({
      success: true,
      message: emailSent ? "Email sent successfully" : "Message processed",
      details: {
        email: emailSent ? "Sent" : "Failed",
        sms: smsStatus,
      },
    });
  } catch (error) {
    console.error("[MESSAGE] Error in sendMessage:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while processing the message",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
