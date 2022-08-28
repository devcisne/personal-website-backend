import express from 'express';
import bodyParser from 'body-parser'
import cors from 'cors'
import creds from './creds.js';
import nodemailer from 'nodemailer'
import { MongoClient } from 'mongodb';
import { check, validationResult } from 'express-validator'


const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  auth: {
    user: creds.USER,
    pass: creds.PASS
  }
});

const withDB = async (operations, res) => {
  const dbName = 'personalwebsite';
  const url = 'mongodb://localhost:27017';


  try {
    const client = await MongoClient.connect(url, { useNewUrlParser: true });
    const db = client.db(dbName);
    const collection = db.collection('blogEntries');


    await operations(collection);
    client.close();
  } catch (error) {
    console.log(error)
    res.status(500).json({ "msg": `The following error was found with the DB operation: ${error}` })
  }
}


const app = express();
app.use(cors())
app.use(bodyParser.json());

// app.get("/api/", (req, res) => {
//   res.send("root api route");
// });

app.post("/api/insertMany", (req, res) => {
  withDB(async (collection) => {
    const entries = req.body.blogEntries
    await collection.insertMany(entries)
      .then((insertResult) => {
        res.status(200).json(insertResult)
        console.log(insertResult)
      })
      .catch((error) => {
        console.error(error)
        res.status(500).json({ "msg": `The following error was found: ${error}` })
      })
  }, res)

})

app.get("/api/blogEntries/:id", (req, res) => {
  withDB(async (collection) => {
    const ID = req.params.id
    await collection.findOne({ entryID: ID })
      .then((blogEntry) => {
        res.status(200).json(blogEntry)
        console.log(blogEntry)
      })
      .catch((error) => {
        console.error(error)
        res.status(500).json({ "msg": `The following error was found: ${error}` })
      })
  }, res)

})

app.get("/api/blogEntries/", (req, res) => {
  withDB(async (collection) => {
    await collection.find().toArray()
      .then((blogEntryArray) => {
        res.status(200).json(blogEntryArray)
        console.log(blogEntryArray)
      })
      .catch((error) => {
        console.error(error)
        res.status(500).json({ "msg": `The following error was found: ${error}` })
      })
  }, res)

})

app.post("/api/blogEntries/:id/add-comment", (req, res) => {
  const { userName, commentContent } = req.body;
  const ID = req.params.id;
  withDB(async (collection) => {
    const blogEntry = await collection.findOne({ entryID: ID })
    await collection.updateOne({ entryID: ID }, {
      '$set': {
        comments: blogEntry.comments.concat({ userName, commentContent }),
      }
    })
    const updatedEntry = await collection.findOne({ entryID: ID })
    console.log(updatedEntry)
    res.status(200).json(updatedEntry)

  }, res)

})

app.post("/sendMail", [check('email').isEmail()], (req, res) => {
  console.log(req.body)

  const output = `
  <p>You have a new contact request</p>
  <h3>Contact details:</h3>
  <ul>
  <li>Name: ${req.body.senderName}</li>
  <li>Email: ${req.body.email}</li>
  </ul>
  <h3>Message:</h3>
  <p>${req.body.msg || '[No message]'}</p>
  `;

  const mailOptions = {
    from: `"Diego's website" <${creds.USER}>`,
    to: `${creds.USER}`,
    subject: req.body.subject || '[No subject]',
    html: output || '[No message]'
  };

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).send({ message: 'Something is wrong with the request...' });
  }

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) return res.status(500).send(err);
    console.log('Message sent: %s', info);
  });
  res.status(200).json({ "msg": `${req.body.senderName} your contact message has been sent` });

});

app.listen(5000, () => {
  console.log("app is listening to port 5000");
});
