import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import nodemailer from "nodemailer";
import { check, validationResult } from "express-validator";
import axios from "axios";
import dotenv from "dotenv";
import serverless from "serverless-http";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ["USERMAIL", "PASS"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.warn(
    `Warning: Missing environment variables: ${missingEnvVars.join(", ")}`
  );
}

// Optional environment variables warning
const optionalEnvVars = ["VERIFY_SECRET"];
const missingOptionalEnvVars = optionalEnvVars.filter(
  (envVar) => !process.env[envVar]
);

if (missingOptionalEnvVars.length > 0) {
  console.warn(
    `Warning: Missing optional environment variables: ${missingOptionalEnvVars.join(
      ", "
    )}`
  );
}

// Create transporter for nodemailer
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  auth: {
    user: process.env.USERMAIL,
    pass: process.env.PASS,
  },
});

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(bodyParser.json());

// Routes
app.get("/api/", (req, res) => {
  res.send("root api route");
});

app.post("/api/verifyCaptcha", async (req, res) => {
  try {
    console.log("token", req.body.token);
    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.VERIFY_SECRET}&response=${req.body.token}`
    );

    console.log("Response success?", response.data);
    res.status(200).json({ success: response.data.success });
  } catch (error) {
    console.error(`Error with recaptcha req:`, error);
    res.status(500).json({
      msg: `Error verifying captcha: ${error.message}`,
      success: false,
    });
  }
});

app.post(
  "/api/sendMail",
  [
    check("email").isEmail(),
    check("subject").isLength({ min: 5 }),
    check("msg").isLength({ min: 5 }),
  ],
  async (req, res) => {
    console.log(req.body);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const output = `
      <p>You have a new contact request</p>
      <h3>Contact details:</h3>
      <ul>
        <li>Name: ${req.body.senderName}</li>
        <li>Email: ${req.body.email}</li>
      </ul>
      <h3>Message:</h3>
      <p>${req.body.msg || "[No message]"}</p>
    `;

    const mailOptions = {
      from: `"Diego's website" <${process.env.USERMAIL}>`,
      to: `${process.env.USERMAIL}`,
      subject: req.body.subject || "[No subject]",
      html: output || "[No message]",
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("Message sent: %s", info.messageId);
      res.status(200).json({
        msg: `${req.body.senderName} your contact message has been sent`,
      });
    } catch (error) {
      console.error("Failed to send email:", error);
      res.status(500).json({
        msg: `Failed to send email: ${error.message}`,
      });
    }
  }
);

const handler = serverless(app);
export { app, handler };
