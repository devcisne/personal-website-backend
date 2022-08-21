import express from 'express';
import bodyParser from 'body-parser'
import cors from 'cors'
import creds from './creds.js';
import nodemailer from 'nodemailer'
import { check, validationResult } from 'express-validator'


const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  auth: {
    user: creds.USER,
    pass: creds.PASS
  }
});


const app = express();
app.use(cors())
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Welcome to Ass ree");
});

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
  <p>${req.body.msg}</p>
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
  // res.status(200).send(`henlo fren ${req.body.senderName}`);

  console.log("REEE")
});

app.listen(5000, () => {
  console.log("app is listening to port 5000");
});
