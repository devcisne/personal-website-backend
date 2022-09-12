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

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  auth: {
    user: process.env.USERMAIL,
    pass: process.env.PASS,
  },
});

const withDB = async (operations, res) => {
  const dbName = "personalwebsite";
  // const url = "mongodb://127.0.0.1:27017";
  const url = `mongodb+srv://${process.env.MONGOUSER}:${process.env.MONGOPASS}@personalwebsite.r9tnm38.mongodb.net/?retryWrites=true&w=majority`;

  try {
    const client = await MongoClient.connect(url, { useNewUrlParser: true });
    const db = client.db(dbName);
    const collection = db.collection("blogEntries");

    await operations(collection);
    client.close();
  } catch (error) {
    console.log(error);
    res.status(500).json({
      msg: `The following error was found with the DB operation: ${error}`,
    });
  }
};

const app = express();

app.use(cors({ origin: "https://www.diegocisneros.dev" }));
app.use(bodyParser.json());

app.get("/api/", (req, res) => {
  res.send("root api route");
});

// app.post("/api/insertMany", (req, res) => {
//   withDB(async (collection) => {
//     const entries = req.body.blogEntries;
//     await collection
//       .insertMany(entries)
//       .then((insertResult) => {
//         res.status(200).json(insertResult);
//         console.log(insertResult);
//       })
//       .catch((error) => {
//         console.error(error);
//         res
//           .status(500)
//           .json({ msg: `The following error was found: ${error}` });
//       });
//   }, res);
// });

app.get("/api/blogEntries/:id", (req, res) => {
  withDB(async (collection) => {
    const ID = req.params.id;
    await collection
      .findOne({ entryID: ID })
      .then((blogEntry) => {
        res.status(200).json(blogEntry);
        console.log(blogEntry);
      })
      .catch((error) => {
        console.error(error);
        res
          .status(500)
          .json({ msg: `The following error was found: ${error}` });
      });
  }, res);
});

app.get("/api/blogEntries/", (req, res) => {
  withDB(async (collection) => {
    await collection
      .find()
      .toArray()
      .then((blogEntryArray) => {
        res.status(200).json(blogEntryArray);
        console.log(blogEntryArray);
      })
      .catch((error) => {
        console.error(error);
        res
          .status(500)
          .json({ msg: `The following error was found: ${error}` });
      });
  }, res);
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
      return res
        .status(400)
        .json({ message: "Something is wrong with the request..." });
    }

    withDB(async (collection) => {
      const blogEntry = await collection.findOne({ entryID: ID });
      await collection.updateOne(
        { entryID: ID },
        {
          $set: {
            comments: blogEntry.comments.concat({ userName, commentContent }),
          },
        }
      );
      const updatedEntry = await collection.findOne({ entryID: ID });
      console.log(updatedEntry);

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
        subject: `new Comment - ${ID}` || "[No subject]",
        html: output || "[No message]",
      };

      const info = transporter.sendMail(mailOptions);
      info
        .then((info) => {
          console.log("Message sent: %s", info);
        })
        .catch((err) => {
          return res.status(500).send(err);
        });

      res.status(200).json(updatedEntry);
    }, res);
  }
);

app.post("/api/verifyCaptcha", (req, res) => {
  console.log("token", req.body.token);
  axios({
    method: "POST",
    url: `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.VERIFY_SECRET}&response=${req.body.token}`,
  })
    .then((response) => {
      console.log("Response success?", response.data);
      res.status(200).json({ success: response.data.success });
    })
    .catch((error) => {
      console.log(`Error with recaptcha req:`, error);
    });
});

app.post(
  "/api/sendMail",
  [
    check("email").isEmail(),
    check("subject").isLength({ min: 5 }),
    check("msg").isLength({ min: 5 }),
  ],
  (req, res) => {
    console.log(req.body);

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

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ message: "Something is wrong with the request..." });
    }

    const info = transporter.sendMail(mailOptions);
    info
      .then((info) => {
        console.log("Message sent: %s", info);
        res.status(200).json({
          msg: `${req.body.senderName} your contact message has been sent`,
        });
      })
      .catch((err) => {
        return res.status(500).send(err);
      });
  }
);

const handler = serverless(app);
export { app, handler };
