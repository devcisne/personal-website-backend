import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import nodemailer from "nodemailer";
import { MongoClient } from "mongodb";
import { check, validationResult } from "express-validator";
import axios from "axios";
import dotenv from "dotenv";
import serverless from "serverless-http";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ["USERMAIL", "PASS", "MONGOUSER", "MONGOPASS"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.warn(
    `Warning: Missing environment variables: ${missingEnvVars.join(", ")}`
  );
}

// Optional environment variables warning
const optionalEnvVars = ["MAILBLUSTER_API_KEY", "VERIFY_SECRET"];
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

// Unified database connection function
const withDB = async (dbName, collectionName, operations, res) => {
  const url = `mongodb+srv://${process.env.MONGOUSER}:${process.env.MONGOPASS}@personalwebsite.r9tnm38.mongodb.net/?retryWrites=true&w=majority`;

  let client;
  try {
    client = await MongoClient.connect(url);
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    await operations(collection);
  } catch (error) {
    console.error("Database operation error:", error);
    if (res) {
      res.status(500).json({
        msg: `Database operation failed: ${error.message}`,
      });
    }
  } finally {
    if (client) {
      await client.close();
    }
  }
};

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(bodyParser.json());

// Routes
app.get("/api/", (req, res) => {
  res.send("root api route");
});

// Newsletter routes
app.get("/api/newsletters", (req, res) => {
  withDB(
    "personalwebsite-dev",
    "newsletters",
    async (collection) => {
      try {
        const newsletterCount = await collection.countDocuments({});
        console.log("newsletterCount is:", newsletterCount);
        res.status(200).json(newsletterCount);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ msg: `Error fetching newsletter count: ${error.message}` });
      }
    },
    res
  );
});

app.get("/api/newsletters/:id", (req, res) => {
  withDB(
    "personalwebsite-dev",
    "newsletters",
    async (collection) => {
      try {
        const ID = req.params.id;
        console.log(ID, Number(ID));
        const newsletter = await collection.findOne({
          newsletterID: Number(ID),
        });
        console.log("sending item of id", newsletter);
        res.status(200).json(newsletter);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ msg: `Error fetching newsletter: ${error.message}` });
      }
    },
    res
  );
});

// Blog entries routes
app.get("/api/blogEntries/:id", (req, res) => {
  withDB(
    "personalwebsite-dev",
    "blogEntries",
    async (collection) => {
      try {
        const ID = req.params.id;
        const blogEntry = await collection.findOne({ entryID: ID });
        console.log(blogEntry);
        res.status(200).json(blogEntry);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ msg: `Error fetching blog entry: ${error.message}` });
      }
    },
    res
  );
});

app.get("/api/blogEntries/", (req, res) => {
  withDB(
    "personalwebsite-dev",
    "blogEntries",
    async (collection) => {
      try {
        const blogEntryArray = await collection.find().toArray();
        console.log(blogEntryArray);
        res.status(200).json(blogEntryArray);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ msg: `Error fetching blog entries: ${error.message}` });
      }
    },
    res
  );
});

app.post(
  "/api/blogEntries/:id/add-comment",
  [
    check("commentContent").isLength({ min: 5 }),
    check("userName").isLength({ min: 3 }),
  ],
  (req, res) => {
    const { userName, commentContent } = req.body;
    const ID = req.params.id;

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    withDB(
      "personalwebsite-dev",
      "blogEntries",
      async (collection) => {
        try {
          const blogEntry = await collection.findOne({ entryID: ID });
          if (!blogEntry) {
            return res.status(404).json({ message: "Blog entry not found" });
          }

          const updatedEntry = await collection.findOneAndUpdate(
            { entryID: ID },
            {
              $push: {
                comments: { userName, commentContent },
              },
            },
            { returnDocument: "after" }
          );

          console.log(updatedEntry.value);

          // Send email notification
          const output = `
          <h2>New comment alert!:</h2>
          <p>There's been a new comment on article ${ID}</p>
          <h3>User name: ${userName}</h3>
          <h3>Comment:</h3>
          <p>${commentContent || "[No Comment]"}</p>
        `;

          const mailOptions = {
            from: `"Diego's website" <${process.env.USERMAIL}>`,
            to: `${process.env.USERMAIL}`,
            subject: `New Comment - ${ID}` || "[No subject]",
            html: output || "[No message]",
          };

          try {
            const info = await transporter.sendMail(mailOptions);
            console.log("Message sent: %s", info.messageId);
          } catch (emailError) {
            console.error("Failed to send email notification:", emailError);
          }

          res.status(200).json(updatedEntry.value);
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ msg: `Error adding comment: ${error.message}` });
        }
      },
      res
    );
  }
);

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

app.post("/api/registerNewsletterEmail", async (req, res) => {
  try {
    console.log("req", req.body);
    const reqObj = {
      email: req.body.email,
      subscribed: false,
      doubleOptIn: true,
    };
    console.log(reqObj);

    const response = await axios.post(
      `https://api.mailbluster.com/api/leads`,
      reqObj,
      {
        headers: {
          Authorization: process.env.MAILBLUSTER_API_KEY,
        },
      }
    );

    console.log("Response success?", response.data);
    res.status(200).json({ success: response.data.success });
  } catch (error) {
    console.error(`Error with newsletter register req:`, error);
    res.status(500).json({
      msg: `Error registering newsletter: ${error.message}`,
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
